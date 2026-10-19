## Change

Describe the problem, resulting behavior and linked issue.

## Validation

- [ ] Local repository policy and redacted secret scan passed before push.
- [ ] Applicable tests/builds passed; list evidence and remaining limitations.
- [ ] No secrets, generated files, binaries or private diagnostics are included.
- [ ] Names and documentation describe the project without unrelated references.
- [ ] Maintainer manually reviewed the diff and CI for this exact commit.

For `develop` to `main`: record integration test evidence from the exact develop
commit, known limitations, and why the integrated result is considered stable.
Merge does not authorize release, deployment or remote database changes.
