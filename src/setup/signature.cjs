const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const execute = promisify(execFile);
async function verifySignature(file) {
  const env = { ...process.env, HDS_INSTALLER_FILE: file };
  // Do not inherit PowerShell 7 module locations into Windows PowerShell 5.1.
  delete env.PSModulePath;
  const { stdout } = await execute(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [Text.Encoding]::UTF8; $s = Get-AuthenticodeSignature -LiteralPath $env:HDS_INSTALLER_FILE; [Console]::Write($s.Status.ToString())",
    ],
    {
      windowsHide: true,
      timeout: 120000,
      env,
    },
  );
  if (stdout.trim() !== "Valid")
    throw new Error(
      "QQ 安装包数字签名验证未通过，请检查网络和系统时间后重试。安装器未启动。",
    );
}
module.exports = { verifySignature };
