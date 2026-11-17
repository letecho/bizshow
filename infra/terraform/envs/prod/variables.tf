variable "project" {
  type    = string
  default = "fss"
}

variable "env" {
  type    = string
  default = "prod"
}

variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

# ==========================================
# 将来拡張スイッチ (Alternative B -> フル構成切替用)
# ==========================================
variable "enable_valkey" {
  description = "SW-01: trueでElastiCache Valkeyを有効化"
  type        = bool
  default     = false
}

variable "use_fargate_spot" {
  description = "SW-02: trueでFargate Spotを併用しコスト削減"
  type        = bool
  default     = true
}

variable "rds_multi_az" {
  description = "SW-03: trueでRDSマルチAZ冗長化を有効化"
  type        = bool
  default     = false
}

variable "rds_instance_class" {
  description = "SW-03: RDSインスタンスタイプ"
  type        = string
  default     = "db.t4g.micro"
}

variable "log_retention_days" {
  description = "SW-05: CloudWatch Logs保持日数"
  type        = number
  default     = 7
}
