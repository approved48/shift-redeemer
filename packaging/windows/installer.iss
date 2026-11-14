; Inno Setup script for the Windows installer.
; Built automatically by .github/workflows/build.yml after `npm run build`:
;   ISCC /DAppVersion=1.2.3 packaging\windows\installer.iss
; Installs per-user (no admin prompt) into %LOCALAPPDATA%\Programs\SHiFT Redeemer.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#define AppName "SHiFT Redeemer"
#define AppExe "SHiFT Redeemer.exe"

[Setup]
AppId={{8B3C2F7A-5E1D-4C9B-9A64-2F0D7E1B6C11}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=SHiFT Redeemer (unofficial fan tool)
AppComments=Finds SHiFT codes and redeems them for your Borderlands games. Not affiliated with Gearbox Software.
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\dist\release
OutputBaseFilename=SHiFT-Redeemer-Setup-{#AppVersion}-Windows
SetupIconFile=..\..\assets\icon.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=force

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "..\..\dist\build\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Open {#AppName} now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/f /im ""{#AppExe}"""; Flags: runhidden; RunOnceId: "StopApp"
Filename: "{sys}\reg.exe"; Parameters: "delete HKCU\Software\Microsoft\Windows\CurrentVersion\Run /v ""{#AppName}"" /f"; Flags: runhidden; RunOnceId: "RemoveStartup"

[Code]
// Close a running copy before installing an update over it.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/f /im "{#AppExe}"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;
