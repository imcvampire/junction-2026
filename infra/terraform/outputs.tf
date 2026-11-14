output "instance_id" {
  value = verda_instance.app.id
}

output "public_ip" {
  value = verda_instance.app.ip
}

output "price_per_hour" {
  value = verda_instance.app.price_per_hour
}
