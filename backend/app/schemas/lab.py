from pydantic import BaseModel


class LabScenarioResponse(BaseModel):
    code: str
    title: str
    description: str
    detection_focus: str
    expected_outcome: str


class LabScenarioExecutionResponse(BaseModel):
    scenario_code: str
    message: str
    created_order_ids: list[str]
    created_risk_event_ids: list[str]
