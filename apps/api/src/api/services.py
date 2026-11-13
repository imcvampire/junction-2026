from dataclasses import dataclass
from typing import Annotated, cast

from fastapi import Depends, Request

from api.agent.loop import Agent
from api.catalog.index import Catalog
from api.config import Settings
from api.orders.service import OrderService
from api.orders.store import Store
from api.valio.client import ValioClient
from api.voice.provider import VoiceProvider


@dataclass
class Services:
    settings: Settings
    catalog: Catalog
    valio: ValioClient
    store: Store
    orders: OrderService
    agent: Agent
    voice: VoiceProvider


def get_services(request: Request) -> Services:
    return cast(Services, request.app.state.services)


Deps = Annotated[Services, Depends(get_services)]
