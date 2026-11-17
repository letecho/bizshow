terraform {
  required_version = ">= 1.9.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "network" {
  source   = "../../modules/network"
  project  = var.project
  env      = var.env
  vpc_cidr = var.vpc_cidr
}

module "database" {
  source             = "../../modules/database"
  project            = var.project
  env                = var.env
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  ecs_sg_id          = module.network.ecs_sg_id
  enable_valkey      = var.enable_valkey
  rds_multi_az       = var.rds_multi_az
  rds_instance_class = var.rds_instance_class
}

module "compute" {
  source             = "../../modules/compute"
  project            = var.project
  env                = var.env
  vpc_id             = module.network.vpc_id
  public_subnet_ids  = module.network.public_subnet_ids
  alb_sg_id          = module.network.alb_sg_id
  ecs_sg_id          = module.network.ecs_sg_id
  use_fargate_spot   = var.use_fargate_spot
  log_retention_days = var.log_retention_days
}
