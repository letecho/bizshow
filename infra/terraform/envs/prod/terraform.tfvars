# Phase1 初期設定（月額税込 約8,745円構成）
# サービス成長時は該当フラグを true に変更して terraform apply するだけで無停止スケール可能
project            = "fss"
env                = "prod"
enable_valkey      = false
use_fargate_spot   = true
rds_multi_az       = false
rds_instance_class = "db.t4g.micro"
log_retention_days = 7
