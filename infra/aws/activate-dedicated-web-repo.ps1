param(
  [string]$AwsProfile = 'fight-ai',
  [string]$AwsRoleName = 'FightAIGitHubDeployRole',
  [string]$GitHubRepo = 'pinoaraj/fight-ai-web'
)

$ErrorActionPreference = 'Stop'

$Owner = 'pinoaraj'
$OwnerId = '132783424'
$RepoName = 'fight-ai-web'
$RepoId = '1350097982'
$Branch = 'main'

Write-Host 'Fight AI Web - activate dedicated repository' -ForegroundColor Cyan

$AccountId = (aws sts get-caller-identity --profile $AwsProfile --query Account --output text).Trim()
if (-not $AccountId) { throw "AWS profile '$AwsProfile' is not authenticated." }

$ProviderArn = "arn:aws:iam::${AccountId}:oidc-provider/token.actions.githubusercontent.com"
$ImmutableRepo = "${Owner}@${OwnerId}/${RepoName}@${RepoId}"
$Subject = "repo:${ImmutableRepo}:ref:refs/heads/${Branch}"

$TrustPath = Join-Path $env:TEMP 'fight-ai-web-oidc-trust.json'
@"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"Federated": "$ProviderArn"},
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {"token.actions.githubusercontent.com:aud": "sts.amazonaws.com"},
        "StringLike": {"token.actions.githubusercontent.com:sub": "$Subject"}
      }
    }
  ]
}
"@ | Set-Content -Encoding ascii $TrustPath

aws iam update-assume-role-policy --role-name $AwsRoleName --policy-document "file://$TrustPath" --profile $AwsProfile
if ($LASTEXITCODE -ne 0) { throw 'Failed to update AWS GitHub OIDC trust.' }

$Trust = aws iam get-role --role-name $AwsRoleName --profile $AwsProfile --query 'Role.AssumeRolePolicyDocument' --output json
if ($LASTEXITCODE -ne 0) { throw 'Unable to verify IAM role trust.' }
if ($Trust -notmatch [regex]::Escape($Subject)) { throw "OIDC verification failed: subject '$Subject' not found." }

Write-Host "AWS OIDC trust VERIFIED: $Subject" -ForegroundColor Green

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Warning 'GitHub CLI (gh) is not installed. AWS trust is updated, but GEMINI_API_KEY must be added in GitHub manually.'
  exit 0
}

gh auth status
if ($LASTEXITCODE -ne 0) {
  Write-Warning 'GitHub CLI is not authenticated. Run gh auth login, then rerun this script to configure the secret.'
  exit 0
}

$ExistingSecrets = gh secret list --repo $GitHubRepo 2>$null
if ($ExistingSecrets -match '^GEMINI_API_KEY\s') {
  Write-Host 'GitHub secret GEMINI_API_KEY already exists.' -ForegroundColor Green
} else {
  Write-Host 'GEMINI_API_KEY is not present in the new repository.'
  Write-Host 'Paste it at the secure prompt. It will be piped to GitHub and will not be written to the repository.'
  $Secure = Read-Host 'GEMINI_API_KEY' -AsSecureString
  $Bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try {
    $Plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr)
    if (-not $Plain) { throw 'No Gemini key was provided.' }
    $Plain | gh secret set GEMINI_API_KEY --repo $GitHubRepo
    if ($LASTEXITCODE -ne 0) { throw 'Failed to create GEMINI_API_KEY in GitHub.' }
  }
  finally {
    if ($Bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr) }
    $Plain = $null
  }
  Write-Host 'GitHub secret GEMINI_API_KEY configured.' -ForegroundColor Green
}

Write-Host ''
Write-Host 'Activation prerequisites VERIFIED.' -ForegroundColor Green
Write-Host "Repository: $GitHubRepo"
Write-Host "Branch: $Branch"
Write-Host "OIDC subject: $Subject"
Write-Host 'Next: run the Web AWS Deploy workflow manually from GitHub Actions.'