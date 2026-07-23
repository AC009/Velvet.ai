Select-String -Path c:\velvet\_fix_status.txt -Pattern typecheck_exit | ForEach-Object { $_.Line } | Set-Content c:\velvet\_find_tsc.txt
Select-String -Path c:\velvet\_fix_status.txt -Pattern build_exit | ForEach-Object { $_.Line } | Set-Content c:\velvet\_find_build.txt
Select-String -Path c:\velvet\_fix_status.txt -Pattern install_exit | ForEach-Object { $_.Line } | Set-Content c:\velvet\_find_install.txt
Select-String -Path c:\velvet\_fix_status.txt -Pattern package_json | ForEach-Object { $_.Line } | Set-Content c:\velvet\_find_pwa.txt
Select-String -Path c:\velvet\_fix_status.txt -Pattern 'error TS' | ForEach-Object { $_.Line } | Select-Object -First 40 | Set-Content c:\velvet\_find_err.txt
