variable "project" { type = string }
variable "env" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "alb_sg_id" { type = string }
variable "ecs_sg_id" { type = string }
variable "use_fargate_spot" { type = bool }
variable "log_retention_days" { type = number }

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.project}-${var.env}"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "main" {
  name = "${var.project}-${var.env}"
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = var.use_fargate_spot ? 1 : 100
    base              = 1
  }

  dynamic "default_capacity_provider_strategy" {
    for_each = var.use_fargate_spot ? [1] : []
    content {
      capacity_provider = "FARGATE_SPOT"
      weight            = 3
    }
  }
}

resource "aws_ecr_repository" "web" {
  name                 = "${var.project}-web"
  image_tag_mutability = "MUTABLE"
}

resource "aws_ecr_repository" "api" {
  name                 = "${var.project}-api"
  image_tag_mutability = "MUTABLE"
}

# 古いイメージを自動削除してECR保存費を節約
resource "aws_ecr_lifecycle_policy" "cleanup" {
  for_each   = { web = aws_ecr_repository.web.name, api = aws_ecr_repository.api.name }
  repository = each.value
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}
