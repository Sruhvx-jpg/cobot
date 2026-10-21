package chai

import (
	"database/sql"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"unicode"
)

// Tabler allows models to define a custom table name.
type Tabler interface {
	TableName() string
}

// AutoMigrate inspects the provided Go struct models via reflection,
// derives table schemas, column types, constraints, and indexes,
// and executes idempotent CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS DDL statements on db.
func AutoMigrate(db *sql.DB, models ...any) error {
	for _, model := range models {
		ddl, err := GenerateDDL(model)
		if err != nil {
			return fmt.Errorf("failed to generate DDL for %T: %w", model, err)
		}

		if _, err := db.Exec(ddl); err != nil {
			return fmt.Errorf("migration failed for %T with DDL %q: %w", model, ddl, err)
		}
	}
	return nil
}

type columnDef struct {
	name       string
	sqlType    string
	isPK       bool
	isNotNull  bool
	isUnique   bool
	defaultVal string
}

type indexDef struct {
	name     string
	columns  []indexedCol
}

type indexedCol struct {
	name     string
	priority int
}

// GenerateDDL derives the SQL DDL for a given model struct.
func GenerateDDL(model any) (string, error) {
	val := reflect.ValueOf(model)
	if val.Kind() == reflect.Pointer {
		val = val.Elem()
	}
	if val.Kind() != reflect.Struct {
		return "", fmt.Errorf("expected struct, got %s", val.Kind())
	}

	typ := val.Type()

	// 1. Determine table name
	tableName := ""
	if tabler, ok := reflect.New(typ).Interface().(Tabler); ok {
		tableName = tabler.TableName()
	} else if tabler, ok := model.(Tabler); ok {
		tableName = tabler.TableName()
	} else {
		tableName = toSnakeCase(typ.Name()) + "s"
	}

	var columns []columnDef
	compositeIndexes := make(map[string][]indexedCol)
	var singleIndexes []string

	for i := 0; i < typ.NumField(); i++ {
		field := typ.Field(i)
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

		colName := getColumnName(field, tag)
		sqlType := inferSQLType(field.Type, tag)

		col := columnDef{
			name:    colName,
			sqlType: sqlType,
		}

		parseTagModifiers(tag, &col)
		parseIndexTags(tableName, colName, tag, &singleIndexes, compositeIndexes)

		// Fallback check for gorm tag compatibility if user tags with gorm
		if gormTag := field.Tag.Get("gorm"); gormTag != "" {
			parseTagModifiers(gormTag, &col)
			parseIndexTags(tableName, colName, gormTag, &singleIndexes, compositeIndexes)
		}

		columns = append(columns, col)
	}

	if len(columns) == 0 {
		return "", fmt.Errorf("model %s has no exported columns", typ.Name())
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s (\n", tableName))

	var colStrs []string
	var pkCols []string

	for _, col := range columns {
		parts := []string{col.name, col.sqlType}
		if col.isPK {
			pkCols = append(pkCols, col.name)
		}
		if col.isNotNull && !col.isPK {
			parts = append(parts, "NOT NULL")
		}
		if col.isUnique && !col.isPK {
			parts = append(parts, "UNIQUE")
		}
		if col.defaultVal != "" {
			parts = append(parts, "DEFAULT "+col.defaultVal)
		}
		colStrs = append(colStrs, "    "+strings.Join(parts, " "))
	}

	if len(pkCols) > 0 {
		colStrs = append(colStrs, fmt.Sprintf("    PRIMARY KEY (%s)", strings.Join(pkCols, ", ")))
	}

	sb.WriteString(strings.Join(colStrs, ",\n"))
	sb.WriteString("\n);\n")

	// Single indexes
	for _, colName := range singleIndexes {
		idxName := fmt.Sprintf("idx_%s_%s", tableName, colName)
		sb.WriteString(fmt.Sprintf("CREATE INDEX IF NOT EXISTS %s ON %s(%s);\n", idxName, tableName, colName))
	}

	// Composite indexes
	for idxName, cols := range compositeIndexes {
		sort.Slice(cols, func(i, j int) bool {
			return cols[i].priority < cols[j].priority
		})
		var colNames []string
		for _, c := range cols {
			colNames = append(colNames, c.name)
		}
		sb.WriteString(fmt.Sprintf("CREATE INDEX IF NOT EXISTS %s ON %s(%s);\n", idxName, tableName, strings.Join(colNames, ", ")))
	}

	return sb.String(), nil
}

func getColumnName(field reflect.StructField, tag string) string {
	parts := strings.Split(tag, ";")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "column:") {
			return strings.TrimPrefix(part, "column:")
		}
	}

	// check if the first part is a bare column name (like db:"receiver_id" or chai:"id;primaryKey")
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

func inferSQLType(t reflect.Type, tag string) string {
	for _, part := range strings.Split(tag, ";") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "type:") {
			return strings.ToUpper(strings.TrimPrefix(part, "type:"))
		}
	}

	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}

	switch t.Kind() {
	case reflect.String:
		return "TEXT"
	case reflect.Bool:
		return "BOOL"
	case reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int,
		reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint:
		return "INTEGER"
	case reflect.Int64, reflect.Uint64:
		return "BIGINT"
	case reflect.Float32, reflect.Float64:
		return "DOUBLE PRECISION"
	case reflect.Slice:
		if t.Elem().Kind() == reflect.Uint8 {
			return "BLOB"
		}
		return "JSON"
	case reflect.Map, reflect.Struct:
		return "JSON"
	default:
		return "TEXT"
	}
}

func parseTagModifiers(tag string, col *columnDef) {
	for _, part := range strings.Split(tag, ";") {
		part = strings.TrimSpace(part)
		switch {
		case part == "primaryKey" || part == "pk":
			col.isPK = true
		case part == "not null" || part == "notnull":
			col.isNotNull = true
		case part == "unique":
			col.isUnique = true
		case strings.HasPrefix(part, "default:"):
			col.defaultVal = strings.TrimPrefix(part, "default:")
		}
	}
}

func parseIndexTags(tableName, colName, tag string, singles *[]string, composites map[string][]indexedCol) {
	for _, part := range strings.Split(tag, ";") {
		part = strings.TrimSpace(part)
		if part == "index" {
			*singles = append(*singles, colName)
			continue
		}

		if strings.HasPrefix(part, "index:") {
			idxSpec := strings.TrimPrefix(part, "index:")
			subParts := strings.Split(idxSpec, ",")
			idxName := subParts[0]
			priority := 100

			for _, sp := range subParts[1:] {
				if strings.HasPrefix(sp, "priority:") {
					fmt.Sscanf(strings.TrimPrefix(sp, "priority:"), "%d", &priority)
				}
			}

			composites[idxName] = append(composites[idxName], indexedCol{
				name:     colName,
				priority: priority,
			})
		}
	}
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
