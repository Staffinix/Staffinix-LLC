# Feature modules

Feature directories own cohesive business workflows: server functions, domain logic, validation,
and focused tests. TanStack route files remain in `src/routes` and import the feature's public entry
points through the `@/features/<feature>` alias.

Keep generic policies, transport clients, and cross-feature utilities in `src/lib` or
`src/integrations`. Extract existing modules incrementally; avoid a repository-wide move that hides
behavioral changes in path churn.
