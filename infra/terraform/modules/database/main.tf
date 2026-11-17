variable "project" { type = string }
variable "env" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "ecs_sg_id" { type = string }
variable "enable_valkey" { type = bool }
variable "rds_multi_az" { type = bool }
variable "rds_instance_class" { type = string }

resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-${var.env}-db-subnet"
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "db" {
  name   = "${var.project}-${var.env}-db-sg"
  vpc_id = var.vpc_id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.ecs_sg_id]
  }
}

resource "aws_db_instance" "postgres" {
  identifier              = "${var.project}-${var.env}-db"
  engine                  = "postgres"
  engine_version          = "16.4"
  instance_class          = var.rds_instance_class
  allocated_storage       = 20
  storage_type            = "gp3"
  storage_encrypted       = true
  db_name                 = "foreign_service"
  username                = "app_admin"
  manage_master_user_password = true
  backup_retention_period = 7 # PITR有効
  multi_az                = var.rds_multi_az
  db_subnet_group_name    = aws_db_subnet_group.main.name
  vpc_security_group_ids  = [aws_security_group.db.id]
  skip_final_snapshot     = var.env != "prod"
}

# SW-01: ElastiCache Valkey (enable_valkey = true の時のみ構築)
resource "aws_elasticache_subnet_group" "valkey" {
  count      = var.enable_valkey ? 1 : 0
  name       = "${var.project}-${var.env}-valkey-subnet"
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "valkey" {
  count  = var.enable_valkey ? 1 : 0
  name   = "${var.project}-${var.env}-valkey-sg"
  vpc_id = var.vpc_id
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.ecs_sg_id]
  }
}

resource "aws_elasticache_replication_group" "valkey" {
  count                      = var.enable_valkey ? 1 : 0
  replication_group_id       = "${var.project}-${var.env}-valkey"
  description                = "Valkey cache for ${var.env}"
  engine                     = "valkey"
  engine_version             = "8.0"
  node_type                  = "cache.t4g.micro"
  num_cache_clusters         = 1
  subnet_group_name          = aws_elasticache_subnet_group.valkey[0].name
  security_group_ids         = [aws_security_group.valkey[0].id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}
