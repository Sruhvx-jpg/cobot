use actix_web::{http::StatusCode, HttpResponse, ResponseError};
use serde::Serialize;
use std::borrow::Cow;
use std::fmt;

/// Base error struct with an HTTP status code and an overridable message
#[derive(Debug, Clone, Serialize)]
pub struct BaseErr {
    #[serde(skip)]
    pub status_code: StatusCode,
    pub message: Cow<'static, str>,
}

impl BaseErr {
    pub const fn new(status_code: StatusCode, default_msg: &'static str) -> Self {
        Self {
            status_code,
            message: Cow::Borrowed(default_msg),
        }
    }

    pub fn with_message(mut self, msg: impl Into<String>) -> Self {
        self.message = Cow::Owned(msg.into());
        self
    }

    pub fn error_response(&self) -> HttpResponse {
        ResponseError::error_response(self)
    }
}

impl fmt::Display for BaseErr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "HTTP {}: {}", self.status_code.as_u16(), self.message)
    }
}

impl std::error::Error for BaseErr {}

impl ResponseError for BaseErr {
    fn status_code(&self) -> StatusCode {
        self.status_code
    }

    fn error_response(&self) -> HttpResponse {
        HttpResponse::build(self.status_code).json(serde_json::json!({
            "error": self.message,
            "status": self.status_code.as_u16(),
        }))
    }
}

pub fn not_found() -> BaseErr {
    BaseErr::new(StatusCode::NOT_FOUND, "Resource not found")
}

pub fn bad_request() -> BaseErr {
    BaseErr::new(StatusCode::BAD_REQUEST, "Invalid request payload")
}

pub fn payload_too_large() -> BaseErr {
    BaseErr::new(StatusCode::PAYLOAD_TOO_LARGE, "Payload exceeds size limit")
}

pub fn internal() -> BaseErr {
    BaseErr::new(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
}
