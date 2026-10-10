---
name: OpenAPI parameter generation
description: A codegen edge case to watch when an endpoint combines path parameters and query parameters.
---

In this workspace, an OpenAPI contract change that combined path parameters with query parameters caused duplicate generated Zod parameter schemas. Omitting the optional query parameters let generation and library typechecking pass.

**Why:** The generated client and validators are shared across the API server and dashboard, so a schema collision blocks both sides of a feature.

**How to apply:** After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` and `pnpm run typecheck:libs`. If path-plus-query operations collide, inspect the generated names before continuing; the earlier workaround was to omit those optional query parameters.
