"""Speech-to-text and text-to-speech behind the backend so provider keys never reach the device.

Any OpenAI-compatible audio API works (`/v1/audio/transcriptions`, `/v1/audio/speech`). When no
provider is configured the endpoints answer 503 and the app falls back to on-device Web Speech.
"""

import logging
from collections.abc import AsyncGenerator
from typing import Protocol

from openai import APIError, AsyncOpenAI

log = logging.getLogger(__name__)


class VoiceUnavailableError(Exception):
    pass


class VoiceProvider(Protocol):
    @property
    def configured(self) -> bool: ...

    async def transcribe(self, audio: bytes, filename: str, content_type: str, language: str | None) -> str: ...

    def speak(self, text: str, language: str | None) -> AsyncGenerator[bytes]: ...


class OpenAICompatibleVoice:
    def __init__(self, client: AsyncOpenAI | None, *, stt_model: str, tts_model: str, tts_voice: str) -> None:
        self._client = client
        self._stt_model = stt_model
        self._tts_model = tts_model
        self._tts_voice = tts_voice

    @property
    def configured(self) -> bool:
        return self._client is not None

    async def transcribe(self, audio: bytes, filename: str, content_type: str, language: str | None) -> str:
        if self._client is None:
            raise VoiceUnavailableError("voice provider not configured")
        try:
            res = await self._client.audio.transcriptions.create(
                file=(filename, audio, content_type),
                model=self._stt_model,
                language=language or "en",
                response_format="json",
            )
        except APIError as e:
            log.warning("stt_failed status=%s", getattr(e, "status_code", None))
            raise VoiceUnavailableError("speech-to-text failed") from e
        return res.text.strip()

    async def speak(self, text: str, language: str | None) -> AsyncGenerator[bytes]:
        if self._client is None:
            raise VoiceUnavailableError("voice provider not configured")
        try:
            async with self._client.audio.speech.with_streaming_response.create(
                input=text, model=self._tts_model, voice=self._tts_voice, response_format="mp3"
            ) as res:
                async for chunk in res.iter_bytes(8192):
                    yield chunk
        except APIError as e:
            log.warning("tts_failed status=%s", getattr(e, "status_code", None))
            raise VoiceUnavailableError("text-to-speech failed") from e
