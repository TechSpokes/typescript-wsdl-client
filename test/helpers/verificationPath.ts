import path from 'node:path';

/** Resolve repository scratch relative to the checkout or its active verification workspace.
 * @param relative Repository-relative path under tmp.
 * @returns A relative path suitable for generated project and compiler arguments.
 */
export function verificationPath(relative: string): string {
  const workspace = process.env.WSDL_TEST_RUN_DIR;
  return workspace ? path.join(path.relative(process.cwd(), workspace), relative.slice(4)) : relative;
}
