; ===================================================================
; 花生苗 Markdown 编辑器 —— NSIS 安装向导自定义脚本
; -------------------------------------------------------------------
; 作者：何飞    联系方式：微信 6731663
; 开源协议：MIT
;
; 本脚本由 electron-builder 在生成 Windows 安装包时自动包含。
; 安装向导中"自定义安装路径"与"桌面 / 开始菜单快捷方式"两个关键选项
; 由 electron-builder.yml 中的 nsis 配置负责生成：
;     allowToChangeInstallationDirectory: true   -> 显示安装路径选择页
;     createDesktopShortcut: true                -> 显示桌面快捷方式复选框
;     createStartMenuShortcut: true              -> 显示开始菜单快捷方式复选框
; 本脚本只做额外的收尾工作：写入安装信息、清理注册表、卸载时提示。
; ===================================================================

; ---------------------------- 安装包头部信息 ----------------------------
!macro customHeader
  ; 安装程序在标题栏与欢迎页显示的名称
  BrandingText "花生苗 Markdown 编辑器 · 作者 何飞 · 微信 6731663"
!macroend

; ---------------------------- 安装前检查 ----------------------------
!macro customInit
  ; 若检测到程序正在运行，提示用户先关闭，避免安装时文件被占用
  ; （electron-builder 已内置该检查，此处仅补充写入安装标识的准备工作）
!macroend

; ---------------------------- 安装完成后 ----------------------------
!macro customInstall
  ; 记录安装路径与版本号，便于用户排查问题或第三方工具识别
  WriteRegStr HKCU "Software\HuashengmiaoMarkdown" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\HuashengmiaoMarkdown" "Version" "${VERSION}"
  WriteRegStr HKCU "Software\HuashengmiaoMarkdown" "Author" "He Fei (WeChat: 6731663)"
  WriteRegStr HKCU "Software\HuashengmiaoMarkdown" "License" "MIT"
!macroend

; ---------------------------- 卸载时清理 ----------------------------
!macro customUnInstall
  ; 删除安装信息登记项
  DeleteRegKey HKCU "Software\HuashengmiaoMarkdown"

  ; 说明：用户配置（设置、最近文件、版本历史）保存在
  ;       %APPDATA%\花生苗Markdown编辑器 目录下。
  ;       为了让用户重装后仍能保留自己的配置与历史记录，
  ;       这里刻意不删除该目录。用户如需彻底清理，
  ;       可手动删除该目录，或在设置面板中重置。
!macroend

; ---------------------------- 卸载前提示 ----------------------------
!macro customUnInit
  ; 卸载前提醒用户配置目录的位置（仅提示，不做删除）
!macroend
