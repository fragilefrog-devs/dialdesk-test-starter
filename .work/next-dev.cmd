@echo off
rem Supervisor: keeps the Next.js dev server alive across external kills.
rem NOTE: must use bare `node` - the scheduled task cannot resolve G:\nodejs\node.exe.
cd /d H:\ai-voice-receptionist-saas\starter
:loop
echo [%DATE% %TIME%] starting next dev >> dev.supervisor.log
node node_modules\next\dist\bin\next dev >> dev.log 2>> dev.err.log
echo [%DATE% %TIME%] next dev exited with code %ERRORLEVEL% >> dev.supervisor.log
timeout /t 2 /nobreak >nul 2>&1
goto loop
