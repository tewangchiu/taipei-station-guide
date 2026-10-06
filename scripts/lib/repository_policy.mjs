// Public source categories are deliberately narrower than all Markdown/YAML files.
const exactPaths = new Set([
  '.gitignore', '.githooks/pre-push', '.node-version', 'AGENTS.md', 'README.md', 'SECURITY.md',
  'package.json', 'package-lock.json',
  '.github/workflows/checks.yml', '.github/pull_request_template.md',
  'scripts/check_repository_hygiene.mjs', 'scripts/lib/repository_policy.mjs',
  'scripts/check_docs.mjs', 'scripts/run_checks.mjs', 'scripts/run_tests.mjs',
  'scripts/serve_camera_guidance.mjs', 'scripts/serve_manual_visual.mjs',
  'scripts/prepare_camera_prototype.mjs',
  'docs/index.md', 'docs/PRODUCT_SPEC.md', 'docs/LOCAL_ASSETS.md', 'docs/spec-index.json',
  'docs/research/README.md',
  'openspec/project.md',
]);
const slug = '[a-z0-9][a-z0-9_-]*';
const domains = '(?:navigation|privacy|route-data|visual-localization)';
const change = `openspec/changes/(?:archive/)?${slug}`;
const categories = [
  /^src\/[a-z0-9_/.-]+\.(?:mjs|css|html)$/,
  /^docs\/contracts\/[a-z0-9_-]+\.schema\.json$/,
  /^data\/(?:mvp|visual_localization)\/[a-z0-9_.-]+\.schema\.json$/,
  /^tests\/(?:unit\/)?(?:visual_localization\/)?[a-z0-9_]+\.test\.mjs$/,
  new RegExp(`^docs/(?:adr|product|testing|roadmap|research|runbooks|exec-plans)/${slug}\\.md$`),
  new RegExp(`^docs/testing/matrices/${slug}\\.md$`),
  new RegExp(`^docs/exec-plans/(?:active|completed)/${slug}\\.md$`),
  new RegExp(`^openspec/specs/${domains}/spec\\.md$`),
  new RegExp(`^${change}/(?:proposal|design|tasks|plan)\\.md$`),
  new RegExp(`^${change}/specs/${domains}/spec\\.md$`),
];
const deniedSegment = /(?:^|\/)(?:raw_data|artifacts|reports|records|fixtures|node_modules|private|local|\.ssh|\.aws|\.codex|\.agents)(?:\/|$)/i;

export function isAllowedRepositoryPath(name) {
  if (name.split('/').some(part => !part || part === '.' || part === '..')) return false;
  return !deniedSegment.test(name) && (exactPaths.has(name) || categories.some(pattern => pattern.test(name)));
}

export const contentRules = [
  ['machine_path', /\/(?:Users|Volumes|home|private)\/[^\s"'`<>]+|\/var\/folders\/[^\s"'`<>]+|[A-Za-z]:\\(?:Users|Documents and Settings)\\/i],
  ['private_network_address', /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/],
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['github_token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['aws_access_key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['api_token', /\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}|xox[baprs]-[A-Za-z0-9-]{20,}|AIza[A-Za-z0-9_-]{30,})\b/],
  ['credential_in_url', /https?:\/\/[^\s\/@:]+:[^\s\/@]+@/i],
  ['credential_assignment', /(?:api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[=:]\s*["'][A-Za-z0-9_+\/=.-]{24,}["']/i],
  ['email_address', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/],
];
