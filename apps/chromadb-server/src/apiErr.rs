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

    /// Override the default static message with dynamic context
    pub fn with_message(mut self, msg: impl Into<String>) -> Self {
        self.message = Cow::Owned(msg.into());
        self
    }

    /// Convert into Actix HttpResponse directly without needing ResponseError in scope
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

// ---------------------------------------------------------------------------
// Ready-to-use error components built on BaseErr
// ---------------------------------------------------------------------------

/// 404 Not Found (Default: "Resource not found")
pub fn not_found() -> BaseErr {
    BaseErr::new(StatusCode::NOT_FOUND, "Resource not found")
}

/// 400 Bad Request / Validation Failure (Default: "Invalid request payload")
pub fn bad_request() -> BaseErr {
    BaseErr::new(StatusCode::BAD_REQUEST, "Invalid request payload")
}

/// 413 Payload Too Large (Default: "Payload exceeds size limit")
pub fn payload_too_large() -> BaseErr {
    BaseErr::new(StatusCode::PAYLOAD_TOO_LARGE, "Payload exceeds size limit")
}

/// 500 Internal Server Error (Default: "Internal server error")
pub fn internal() -> BaseErr {
    BaseErr::new(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
}
