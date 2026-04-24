# 自动部署脚本 (PowerShell)
# 使用前请确保已安装 OpenSSH 客户端 (Windows 10/11 自带)

$ServerUser = "ubuntu"
$ServerHost = "82.157.186.237"
$ServerPath = "/home/ubuntu/agri-gateway"
$KeyFile = ".\dtlqnj.pem"
$ProjectName = "agri-gateway"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  开始自动化部署到云端服务器" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. 检查密钥文件
if (-Not (Test-Path $KeyFile)) {
    Write-Host "错误: 找不到密钥文件 $KeyFile" -ForegroundColor Red
    exit 1
}

# 2. 创建临时压缩包 (排除 node_modules, .env 等)
Write-Host "[1/4] 正在打包项目文件..." -ForegroundColor Yellow
$ZipFile = "deploy-package.zip"
if (Test-Path $ZipFile) { Remove-Item $ZipFile }

# 使用 Compress-Archive 打包，排除特定文件夹
Get-ChildItem -Path . -Exclude "node_modules", ".env", "history", "uploads", "*.zip", "*.pem", ".git", ".github" | 
    Compress-Archive -DestinationPath $ZipFile -Force

Write-Host "      打包完成: $ZipFile" -ForegroundColor Green

# 3. 上传到服务器
Write-Host "[2/4] 正在上传到服务器 ($ServerHost)..." -ForegroundColor Yellow
scp -i $KeyFile -o StrictHostKeyChecking=no $ZipFile "${ServerUser}@${ServerHost}:/tmp/"

if ($LASTEXITCODE -ne 0) {
    Write-Host "错误: 上传失败，请检查网络连接或密钥权限。" -ForegroundColor Red
    exit 1
}
Write-Host "      上传成功" -ForegroundColor Green

# 4. 在服务器上执行部署命令
Write-Host "[3/4] 正在远程执行部署命令..." -ForegroundColor Yellow
$RemoteCommand = @"
cd $ServerPath
echo '备份当前版本...'
if [ -d backup ]; then rm -rf backup; fi
mkdir -p backup
cp -r * backup/ 2>/dev/null || true

echo '解压新版本...'
unzip -o /tmp/$ZipFile -d .

echo '安装依赖...'
npm install --production

echo '重启服务...'
pm2 restart $ProjectName || pm2 start index.js --name $ProjectName
pm2 save

echo '清理临时文件...'
rm /tmp/$ZipFile
"@

ssh -i $KeyFile -o StrictHostKeyChecking=no ${ServerUser}@${ServerHost} $RemoteCommand

if ($LASTEXITCODE -eq 0) {
    Write-Host "[4/4] 部署成功！" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
} else {
    Write-Host "警告: 远程命令执行过程中可能出现了一些问题，请登录服务器检查。" -ForegroundColor Yellow
}

# 清理本地临时文件
Remove-Item $ZipFile
Write-Host "本地临时文件已清理。" -ForegroundColor Gray
