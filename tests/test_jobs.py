import asyncio

import pytest

from fuin.server.jobs import MAX_PENDING_EVENTS, Job, JobStatus


async def next_event(stream):
    return await asyncio.wait_for(anext(stream), timeout=1)


async def test_stream_broadcasts_every_event_to_each_subscriber():
    job = Job("broadcast")
    first = job.stream()
    second = job.stream()
    try:
        assert await next_event(first) == job.snapshot()
        assert await next_event(second) == job.snapshot()

        for event in (
            {"status": "running", "step": "encrypting_dex", "pct": 40},
            {"status": "done", "step": "done", "pct": 100, "result": {"app_id": "app"}},
        ):
            job.push(event)
            assert await next_event(first) == event
            assert await next_event(second) == event

        with pytest.raises(StopAsyncIteration):
            await next_event(first)
        with pytest.raises(StopAsyncIteration):
            await next_event(second)
    finally:
        await first.aclose()
        await second.aclose()


async def test_stream_reconnect_starts_with_current_state():
    job = Job("reconnect")
    job.push({"status": "running", "step": "encrypting_dex", "pct": 40})
    job.push({"status": "running", "step": "signing", "pct": 85})

    stream = job.stream()
    try:
        assert await next_event(stream) == {"status": "running", "step": "signing", "pct": 85}
    finally:
        await stream.aclose()


@pytest.mark.parametrize(
    "event",
    [
        {"status": "done", "step": "done", "pct": 100, "result": {"app_id": "app"}},
        {"status": "error", "step": "error", "pct": 0, "error": "Packing failed"},
    ],
)
async def test_terminal_state_is_replayed_and_stream_closes(event):
    job = Job("finished")
    job.push(event)

    assert job.snapshot() == event
    assert [item async for item in job.stream()] == [event]


async def test_worker_thread_updates_state_and_wakes_stream():
    job = Job("worker")
    stream = job.stream()
    try:
        await next_event(stream)
        waiting = asyncio.create_task(next_event(stream))
        event = {"status": "running", "step": "aligning", "pct": 75}
        await asyncio.to_thread(job.push_threadsafe, asyncio.get_running_loop(), event)

        assert await waiting == event
        assert job.status == JobStatus.running
        assert job.progress_step == "aligning"
        assert job.progress_pct == 75
    finally:
        await stream.aclose()


async def test_slow_subscriber_is_bounded_and_keeps_terminal_event():
    job = Job("slow")
    stream = job.stream()
    try:
        await next_event(stream)
        for pct in range(MAX_PENDING_EVENTS * 2):
            job.push({"status": "running", "step": "packing", "pct": pct})
        terminal = {"status": "done", "step": "done", "pct": 100}
        job.push(terminal)

        async def drain():
            return [event async for event in stream]

        events = await asyncio.wait_for(drain(), timeout=1)
        assert len(events) == MAX_PENDING_EVENTS
        assert events[-1] == terminal
        assert events[-2]["pct"] == MAX_PENDING_EVENTS * 2 - 1
    finally:
        await stream.aclose()


async def test_disconnect_releases_subscription_and_other_stream_keeps_receiving():
    job = Job("disconnect")
    first = job.stream()
    second = job.stream()
    try:
        await next_event(first)
        await next_event(second)
        await first.aclose()

        event = {"status": "done", "step": "done", "pct": 100}
        job.push(event)
        assert await next_event(second) == event
    finally:
        await first.aclose()
        await second.aclose()

    assert not job._subscribers


async def test_cancelled_stream_releases_subscription():
    job = Job("cancelled")
    stream = job.stream()
    await next_event(stream)
    waiting = asyncio.create_task(anext(stream))
    # Let the generator enter its queue wait before simulating disconnect.
    await asyncio.sleep(0)
    waiting.cancel()
    with pytest.raises(asyncio.CancelledError):
        await waiting

    assert not job._subscribers


async def test_closing_http_stream_releases_job_subscription(monkeypatch):
    from fuin.server.routers import jobs as routes

    job = Job("http-disconnect")
    monkeypatch.setattr(routes, "get_job", lambda job_id: job)
    response = await routes.stream_job(job.job_id)

    await anext(response.body_iterator)
    assert job._subscribers
    await response.body_iterator.aclose()

    assert not job._subscribers
