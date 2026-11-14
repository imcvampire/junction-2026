terraform {
  required_version = ">= 1.9"

  required_providers {
    verda = {
      source  = "verda-cloud/verda"
      version = "~> 1.1"
    }
  }

  # State is kept in a local file. CI restores it from, and saves it back to, the encrypted
  # `tfstate` branch (see .github/workflows/deploy.yml). Swap this for a remote backend
  # (HCP Terraform, S3) if more than one pipeline ever needs to write it.
  backend "local" {
    path = "terraform.tfstate"
  }
}

# Credentials come from VERDA_CLIENT_ID and VERDA_CLIENT_SECRET.
provider "verda" {}
