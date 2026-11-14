variable "name" {
  description = "Hostname and resource name prefix."
  type        = string
  default     = "valio-aimo"
}

variable "location" {
  description = "Verda location code (GET /v1/locations)."
  type        = string
  default     = "FIN-03"
}

variable "instance_type" {
  description = "Verda instance type (GET /v1/instance-types). Changing it replaces the instance and its public IP."
  type        = string
  default     = "CPU.4V.16G.CC"
}

variable "image" {
  description = "OS image type (GET /v1/images). Changing it replaces the instance."
  type        = string
  default     = "26.04.cuda13.2.cc"
}

variable "os_volume_size_gb" {
  description = "OS volume size in GB. Holds Docker images and the SQLite order store."
  type        = number
  default     = 50
}

variable "deploy_ssh_public_key" {
  description = "Public half of the CI deploy key (OpenSSH format)."
  type        = string
}

variable "operator_ssh_public_keys" {
  description = "Extra OpenSSH public keys for humans who need shell access."
  type        = list(string)
  default     = []
}
