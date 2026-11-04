@echo off
chcp 65001 >nul
rem OSLE Select 화면 테스트용 개발 서버 켜기 — 더블클릭하면 서버가 켜지고 브라우저가 로그인 화면을 연다.
rem 끄려면 이 검은 창을 닫으면 된다. 데이터는 .env.local 의 클라우드 개발 DB를 쓴다.
cd /d "%~dp0.."
if not exist ".env.local" (
  echo .env.local 이 없습니다. 개발자에게 받은 .env.local 을 이 폴더에 넣어 주세요.
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3000/login"
"C:\Program Files\nodejs\node.exe" node_modules\next\dist\bin\next dev -p 3000
pause
