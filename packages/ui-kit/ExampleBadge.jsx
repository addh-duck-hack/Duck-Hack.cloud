// Trivial example component — proves the npm workspace links this package
// into frontend-admin/frontend-user correctly. Delete once a real shared
// component (e.g. a Loader used by both frontends) replaces it.
export default function ExampleBadge({ label = "core-ui" }) {
  return <span data-testid="example-badge">{label}</span>;
}
