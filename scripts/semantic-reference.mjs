import {execFileSync} from "node:child_process";
import {existsSync} from "node:fs";
import {resolve} from "node:path";

const venv = resolve("tmp/conformance/reference-venv");
const python = process.env.S01_REFERENCE_PYTHON ?? resolve(venv,
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

if (process.argv[2] === "--setup") {
  execFileSync(process.env.S01_SETUP_PYTHON ?? (process.platform === "win32" ? "python" : "python3"),
    ["-m", "venv", venv], {stdio: "inherit"});
  execFileSync(python, ["-m", "pip", "install", "--only-binary=:all:", "--no-cache-dir",
    "-r", "test/conformance/reference/requirements.txt"], {stdio: "inherit"});
  process.exit(0);
}

if (!existsSync(python)) {
  throw new Error(`Missing required XSD reference Python: ${python}. Run npm run reference:setup.`);
}
execFileSync(python, ["-m", "unittest", "discover", "-s", "test/conformance/reference", "-p", "*_test.py"],
  {stdio: "inherit", env: {...process.env, PYTHONDONTWRITEBYTECODE: "1"}});
execFileSync(python, ["test/conformance/reference/validate.py",
  ...process.argv.slice(2).filter(argument => argument !== "--setup")], {stdio: "inherit"});
