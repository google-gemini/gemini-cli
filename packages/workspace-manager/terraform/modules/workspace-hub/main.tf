# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

resource "google_service_account" "hub_sa" {
  account_id   = "workspace-hub-sa"
  display_name = "Gemini CLI Workspace Hub Service Account"
}

resource "google_project_iam_member" "compute_admin" {
  project = var.project_id
  role    = "roles/compute.instanceAdmin.v1"
  member  = "serviceAccount:${google_service_account.hub_sa.email}"
}

resource "google_project_iam_member" "firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.hub_sa.email}"
}

resource "google_service_account_iam_member" "sa_user" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.compute_default_sa}"
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.hub_sa.email}"
}

resource "google_cloud_run_v2_service" "hub" {
  name     = "workspace-hub"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.hub_sa.email
    containers {
      image = var.hub_image_uri
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }
}

resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
}
