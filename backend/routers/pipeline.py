from fastapi import APIRouter, BackgroundTasks, Request

from schemas import (
    BatchPipelineRequest,
    BatchPipelineResponse,
    ProcessSubmissionRequest,
    ProcessSubmissionResponse,
)
from services.pipeline_service import process_batch, process_submission

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


@router.post("/process", response_model=ProcessSubmissionResponse)
def pipeline_process(
    body: ProcessSubmissionRequest,
    request: Request,
    bg_tasks: BackgroundTasks,
) -> ProcessSubmissionResponse:
    return process_submission(body, request, bg_tasks)


@router.post("/batch", response_model=BatchPipelineResponse)
def pipeline_batch(
    body: BatchPipelineRequest,
    request: Request,
    bg_tasks: BackgroundTasks,
) -> BatchPipelineResponse:
    return process_batch(body, request, bg_tasks)
