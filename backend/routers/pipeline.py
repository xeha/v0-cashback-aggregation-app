from fastapi import APIRouter, BackgroundTasks, Request

from schemas import ProcessSubmissionRequest, ProcessSubmissionResponse
from services.pipeline_service import process_submission

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


@router.post("/process", response_model=ProcessSubmissionResponse)
def pipeline_process(
    body: ProcessSubmissionRequest,
    request: Request,
    bg_tasks: BackgroundTasks,
) -> ProcessSubmissionResponse:
    return process_submission(body, request, bg_tasks)
