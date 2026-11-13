from importlib.metadata import version
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: Literal["ok"] = "ok"
    version: str


@router.get("/health")
def health() -> Health:
    return Health(version=version("api"))
