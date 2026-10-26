"""
In-memory job store for async pack jobs.

Jobs are keyed by job_id (UUID). Each SSE subscriber has its own bounded queue.

The store is process-local and bounded: it keeps at most :data:`MAX_JOBS`
entries, evicting the oldest finished jobs first. Terminal state also lives in
the ``jobs`` table, so evicting a completed job only costs the SSE stream —
status remains available via the DB fallback.
"""

import asyncio
import uuid
from collections import OrderedDict
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

MAX_JOBS = 512
MAX_PENDING_EVENTS = 32


class JobStatus(StrEnum):
    pending = "pending"
    running = "running"
    done = "done"
    error = "error"


@dataclass
class Job:
    job_id: str
    status: JobStatus = JobStatus.pending
    progress_step: str = ""
    progress_pct: int = 0
    result: dict[str, Any] | None = None
    error: str | None = None
    _subscribers: set[asyncio.Queue[dict[str, Any]]] = field(
        default_factory=set, init=False, repr=False, compare=False
    )

    def push(self, event: dict[str, Any]) -> None:
        """Update state and broadcast it on the event loop's own thread.

        Slow subscribers may skip intermediate snapshots, but always receive
        the latest state, including completion. With no subscribers there is
        nothing to buffer; a later connection starts from ``snapshot()``.
        """
        if "status" in event:
            self.status = JobStatus(event["status"])
        self.progress_step = event.get("step", self.progress_step)
        self.progress_pct = event.get("pct", self.progress_pct)
        self.result = event.get("result", self.result)
        self.error = event.get("error", self.error)
        snapshot = self.snapshot()
        for queue in self._subscribers:
            if queue.full():
                queue.get_nowait()
            queue.put_nowait(snapshot)

    def push_threadsafe(self, loop: asyncio.AbstractEventLoop, event: dict[str, Any]) -> None:
        """Queue an event from a worker thread.

        ``asyncio.Queue`` is not thread-safe: ``put_nowait`` resolves waiter
        futures directly, so calling it off-loop races with the loop and leaves
        the SSE consumer unwoken. The pack pipeline runs in an executor, so
        every progress event arrives on the wrong thread.
        """
        loop.call_soon_threadsafe(self.push, event)

    async def stream(self) -> AsyncIterator[dict[str, Any]]:
        """Yield current state, then updates until completion or disconnect."""
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=MAX_PENDING_EVENTS)
        # Register before yielding so an update during the first yield is not lost.
        self._subscribers.add(queue)
        try:
            event = self.snapshot()
            while True:
                yield event
                if event.get("status") in (JobStatus.done, JobStatus.error):
                    break
                event = await queue.get()
        finally:
            self._subscribers.discard(queue)

    def snapshot(self) -> dict[str, Any]:
        """The job's current state as an SSE event."""
        event: dict[str, Any] = {
            "status": self.status,
            "step": self.progress_step or self.status,
            "pct": self.progress_pct,
        }
        if self.result is not None:
            event["result"] = self.result
        if self.error is not None:
            event["error"] = self.error
        return event


_jobs: OrderedDict[str, Job] = OrderedDict()


def _evict() -> None:
    """Drop finished jobs, oldest first, until the store is back under cap."""
    while len(_jobs) > MAX_JOBS:
        for job_id, job in _jobs.items():
            if job.status in (JobStatus.done, JobStatus.error):
                del _jobs[job_id]
                break
        else:
            # Nothing finished to reclaim; the cap gives way rather than
            # dropping a job that is still running.
            return


def create_job() -> Job:
    job_id = str(uuid.uuid4())
    job = Job(job_id=job_id)
    _jobs[job_id] = job
    _evict()
    return job


def get_job(job_id: str) -> Job | None:
    return _jobs.get(job_id)


def reset_jobs() -> None:
    """Drop every tracked job. Test-only helper."""
    _jobs.clear()
