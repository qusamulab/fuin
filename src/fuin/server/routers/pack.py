"""Analyze and pack endpoints."""

import asyncio

from fastapi import APIRouter, Depends, File, Form, UploadFile

from fuin.server import pipeline
from fuin.server.background import spawn
from fuin.server.deps import Jobs, get_engine, verify_api_key
from fuin.server.files import temporary_apk
from fuin.server.jobs import create_job
from fuin.server.schemas import JobAccepted
from fuin.server.services.pack_service import run_pack_job
from fuin.server.uploads import read_apk_upload

router = APIRouter(dependencies=[Depends(verify_api_key)])


def _parse_exclusions(value: str) -> tuple[str, ...]:
    return tuple(name.strip() for name in value.split(",") if name.strip())


@router.post("/analyze")
async def analyze_apk_targets(
    file: UploadFile = File(...),
    exclude_files: str = Form(default=""),
    encrypt_native: bool = Form(default=True),
    encrypt_assets: bool = Form(default=True),
):
    apk_bytes = await read_apk_upload(file)

    options = pipeline.PackOptions(
        encrypt_native=encrypt_native,
        encrypt_assets=encrypt_assets,
        exclude_files=_parse_exclusions(exclude_files),
    )
    with temporary_apk(apk_bytes) as tmp_path:
        return await asyncio.to_thread(pipeline.analyze_targets, tmp_path, options)


@router.post("/pack", response_model=JobAccepted)
async def pack_apk(
    jobs: Jobs,
    file: UploadFile = File(...),
    app_class: str = Form(default=""),
    webhook_url: str = Form(default=""),
    exclude_files: str = Form(default=""),
    encrypt_native: bool = Form(default=True),
    encrypt_assets: bool = Form(default=True),
    # Omitting these defers to the corresponding FUIN_* setting; see PackOptions.
    encrypt_strings: bool | None = Form(default=None),
    root_detection: bool | None = Form(default=None),
    emulator_detection: bool | None = Form(default=None),
):
    apk_bytes = await read_apk_upload(file)
    options = pipeline.PackOptions(
        app_class=app_class or None,
        encrypt_native=encrypt_native,
        encrypt_assets=encrypt_assets,
        encrypt_strings=encrypt_strings,
        root_detection=root_detection,
        emulator_detection=emulator_detection,
        exclude_files=_parse_exclusions(exclude_files),
    )

    job = create_job()
    jobs.create(job.job_id)
    jobs.session.commit()

    spawn(
        run_pack_job(
            get_engine(),
            job,
            apk_bytes,
            webhook_url=webhook_url,
            options=options,
        )
    )
    return JobAccepted(job_id=job.job_id)
