package internal

import (
	"fmt"
	"net/http"
)

// APIError is the standardized operational error contract for Sabha API.
type APIError struct {
	StatusCode    int    `json:"status_code"`
	Message       string `json:"error"`
	IsOperational bool   `json:"is_operational"`
	BaseError     error  `json:"-"` // Hidden from client, preserved for internal error logging
}

// Error implements the standard Go error interface.
func (e *APIError) Error() string {
	if e.BaseError != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.BaseError)
	}
	return e.Message
}

// Wrap attaches an underlying base error (e.g. database error, io error).
func (e *APIError) Wrap(err error) *APIError {
	e.BaseError = err
	return e
}

func resolveMsg(defaultMsg string, custom ...string) string {
	if len(custom) > 0 && custom[0] != "" {
		return custom[0]
	}
	return defaultMsg
}

// WriteAPIError writes the APIError as a JSON response.
func WriteAPIError(w http.ResponseWriter, err *APIError) {
	WriteJSON(w, err.StatusCode, err)
}

// -------------------------------------------------------------------------
// Static Factory Constructors
// -------------------------------------------------------------------------

// BadReq creates a 400 Bad Request APIError.
func BadReq(msg ...string) *APIError {
	return &APIError{
		StatusCode:    http.StatusBadRequest,
		Message:       resolveMsg("bad request", msg...),
		IsOperational: true,
	}
}

// NotFound creates a 404 Not Found APIError.
func NotFound(msg ...string) *APIError {
	return &APIError{
		StatusCode:    http.StatusNotFound,
		Message:       resolveMsg("resource not found", msg...),
		IsOperational: true,
	}
}

// Unauthorized creates a 401 Unauthorized APIError.
func Unauthorized(msg ...string) *APIError {
	return &APIError{
		StatusCode:    http.StatusUnauthorized,
		Message:       resolveMsg("unauthorized", msg...),
		IsOperational: true,
	}
}

// Conflict creates a 409 Conflict APIError.
func Conflict(msg ...string) *APIError {
	return &APIError{
		StatusCode:    http.StatusConflict,
		Message:       resolveMsg("resource conflict", msg...),
		IsOperational: true,
	}
}

// InternalErr creates a 500 Internal Server Error APIError.
func InternalErr(msg ...string) *APIError {
	return &APIError{
		StatusCode:    http.StatusInternalServerError,
		Message:       resolveMsg("internal server error", msg...),
		IsOperational: true,
	}
}
