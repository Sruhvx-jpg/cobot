package orm

import (
	"fmt"
	"reflect"
	"strings"
	"sync"
	"unicode"
)

// ModelMetadata caches reflected information about a struct model.
type ModelMetadata struct {
	TableName string
	Columns   []string
	FieldMap  map[string]int // column name -> struct field index
}

var metadataCache sync.Map // reflect.Type -> *ModelMetadata

// GetModelMetadata inspects model and returns cached metadata.
func GetModelMetadata(model any) (*ModelMetadata, error) {
	val := reflect.ValueOf(model)
	for val.Kind() == reflect.Pointer || val.Kind() == reflect.Interface {
		val = val.Elem()
	}

	if val.Kind() == reflect.Slice {
		elemType := val.Type().Elem()
		for elemType.Kind() == reflect.Pointer {
			elemType = elemType.Elem()
		}
		if elemType.Kind() != reflect.Struct {
			return nil, fmt.Errorf("expected slice of structs, got slice of %s", elemType.Kind())
		}
		return getMetadataForType(elemType)
	}

	if val.Kind() != reflect.Struct {
		return nil, fmt.Errorf("expected struct, got %s", val.Kind())
	}

	return getMetadataForType(val.Type())
}

type tabler interface {
	TableName() string
}

func getMetadataForType(t reflect.Type) (*ModelMetadata, error) {
	if cached, ok := metadataCache.Load(t); ok {
		return cached.(*ModelMetadata), nil
	}

	var tableName string
	dummy := reflect.New(t).Interface()
	if tbl, ok := dummy.(tabler); ok {
		tableName = tbl.TableName()
	} else {
		tableName = toSnakeCase(t.Name()) + "s"
	}

	meta := &ModelMetadata{
		TableName: tableName,
		FieldMap:  make(map[string]int),
	}

	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		if !field.IsExported() {
			continue
		}

		tag := field.Tag.Get("chai")
		if tag == "-" {
			continue
		}
		if tag == "" {
			tag = field.Tag.Get("db")
		}
		if tag == "-" {
			continue
		}

		colName := parseColumnName(field, tag)
		meta.Columns = append(meta.Columns, colName)
		meta.FieldMap[colName] = i
	}

	if len(meta.Columns) == 0 {
		return nil, fmt.Errorf("struct %s has no exported database columns", t.Name())
	}

	metadataCache.Store(t, meta)
	return meta, nil
}

func parseColumnName(field reflect.StructField, tag string) string {
	parts := strings.Split(tag, ";")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "column:") {
			return strings.TrimPrefix(part, "column:")
		}
	}

	if len(parts) > 0 {
		first := strings.TrimSpace(parts[0])
		first = strings.Split(first, ",")[0]
		if first != "" && !strings.Contains(first, ":") && first != "pk" && first != "primaryKey" && first != "index" && first != "notnull" {
			return first
		}
	}

	jsonTag := field.Tag.Get("json")
	if jsonTag != "" && jsonTag != "-" {
		firstJson := strings.Split(jsonTag, ",")[0]
		if firstJson != "" {
			return firstJson
		}
	}

	return toSnakeCase(field.Name)
}

func toSnakeCase(s string) string {
	var res []rune
	for i, r := range s {
		if unicode.IsUpper(r) {
			if i > 0 && (unicode.IsLower(rune(s[i-1])) || (i+1 < len(s) && unicode.IsLower(rune(s[i+1])))) {
				res = append(res, '_')
			}
			res = append(res, unicode.ToLower(r))
		} else {
			res = append(res, r)
		}
	}
	return string(res)
}

// ConvertPlaceholders translates '?' placeholders into Chai's '$1', '$2', ... format.
// Ignores '?' inside quoted string literals.
func ConvertPlaceholders(query string, startIdx int) string {
	var sb strings.Builder
	sb.Grow(len(query) + 16)

	argIdx := startIdx
	inQuote := false
	var quoteChar rune

	for _, r := range query {
		if (r == '\'' || r == '"') && !inQuote {
			inQuote = true
			quoteChar = r
			sb.WriteRune(r)
			continue
		} else if inQuote && r == quoteChar {
			inQuote = false
			sb.WriteRune(r)
			continue
		}

		if r == '?' && !inQuote {
			sb.WriteString(fmt.Sprintf("$%d", argIdx))
			argIdx++
		} else {
			sb.WriteRune(r)
		}
	}

	return sb.String()
}
