import logging
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.agent.state import Language
from api.services import Deps
from api.voice.provider import VoiceUnavailableError

log = logging.getLogger(__name__)

router = APIRouter(prefix="/voice", tags=["voice"])


class VoiceStatus(BaseModel):
    server_voice: bool


class Transcript(BaseModel):
    text: str


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1)
    language: Language = "en"


@router.get("")
def status(svc: Deps) -> VoiceStatus:
    return VoiceStatus(server_voice=svc.voice.configured)


@router.post("/transcribe")
async def transcribe(
    svc: Deps,
    audio: Annotated[UploadFile, File()],
    language: Annotated[Language, Form()] = "en",
) -> Transcript:
    if not svc.voice.configured:
        raise HTTPException(503, "voice_provider_not_configured")
    content_type = (audio.content_type or "").split(";")[0]
    if not content_type.startswith("audio/") and content_type != "video/webm":
        raise HTTPException(415, "audio upload expected")
    limit = svc.settings.voice_max_upload_bytes
    data = await audio.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"audio larger than {limit} bytes")
    try:
        text = await svc.voice.transcribe(data, audio.filename or "speech.webm", content_type, language)
    except VoiceUnavailableError as e:
        raise HTTPException(502, str(e)) from e
    return Transcript(text=text)


@router.post("/speak", response_class=StreamingResponse)
async def speak(svc: Deps, body: SpeakRequest) -> StreamingResponse:
    if not svc.voice.configured:
        raise HTTPException(503, "voice_provider_not_configured")
    if len(body.text) > svc.settings.voice_max_tts_chars:
        raise HTTPException(413, "text too long to speak")
    chunks = svc.voice.speak(body.text, body.language)
    try:
        first = await anext(chunks)
    except StopAsyncIteration:
        first = b""
    except VoiceUnavailableError as e:
        raise HTTPException(502, str(e)) from e

    async def stream() -> AsyncIterator[bytes]:
        yield first
        try:
            async for chunk in chunks:
                yield chunk
        except VoiceUnavailableError:
            log.warning("tts_stream_interrupted")
        finally:
            await chunks.aclose()

    return StreamingResponse(stream(), media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
