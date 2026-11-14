locals {
  ssh_public_keys = concat([var.deploy_ssh_public_key], var.operator_ssh_public_keys)
}

resource "verda_ssh_key" "this" {
  count = length(local.ssh_public_keys)

  name       = "${var.name}-${count.index == 0 ? "deploy" : "operator-${count.index}"}"
  public_key = trimspace(local.ssh_public_keys[count.index])
}

# Host bootstrap (Docker, firewall) runs from CI over SSH instead of a startup script, so it can
# change without replacing the instance.
resource "verda_instance" "app" {
  hostname      = var.name
  description   = "Valio Aimo agent API and web app (Junction 2026)"
  location      = var.location
  instance_type = var.instance_type
  image         = var.image
  ssh_key_ids   = verda_ssh_key.this[*].id

  os_volume = {
    name       = "${var.name}-os"
    size       = var.os_volume_size_gb
    type       = "NVMe"
    on_destroy = "delete_permanently"
  }
}
