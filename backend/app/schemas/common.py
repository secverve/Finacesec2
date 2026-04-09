from pydantic import BaseModel, ConfigDict


class MessageResponse(BaseModel):
    message: str


class ORMBaseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

