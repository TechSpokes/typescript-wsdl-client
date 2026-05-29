export function findDatedChangelogSection(lines, version) {
  const prefix = `## [${version}] - `;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trimEnd();
    if (!line.startsWith(prefix)) continue;
    return { index, dateString: line.slice(prefix.length).trim() };
  }
  return null;
}
