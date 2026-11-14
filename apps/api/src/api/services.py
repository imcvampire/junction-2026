from dataclasses import dataclass
from typing import Annotated, cast

from fastapi import Depends, Request

from api.agents.models import AgentPrincipal
from api.agents.registry import AgentRegistry
from api.catalog.index import Catalog
from api.config import Settings
from api.orders.service import OrderService
from api.orders.store import Store
from api.procurement.service import ProcurementService
from api.valio.client import ValioClient


@dataclass
class Services:
    settings: Settings
    catalog: Catalog
    valio: ValioClient
    store: Store
    orders: OrderService
    agents: AgentRegistry
    procurement: ProcurementService
    mcp_agent: AgentPrincipal


def get_services(request: Request) -> Services:
    return cast(Services, request.app.state.services)


Deps = Annotated[Services, Depends(get_services)]
