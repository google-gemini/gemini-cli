# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region to deploy to"
  type        = string
  default     = "us-west1"
}

variable "hub_image_uri" {
  description = "The Docker image URI for the Workspace Hub"
  type        = string
}

variable "compute_default_sa" {
  description = "The Compute Engine default service account email"
  type        = string
}
