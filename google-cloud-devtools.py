from google.cloud import devtools_v1

def connect_repo(project_id: str, repo_url: str):
    client = devtools_v1.SourceRepoClient()

    parent = f"projects/{project_id}"
    repo = {
        "name": f"{parent}/repos/my-connected-repo",
        "url": repo_url
    }

    response = client.create_repo(parent=parent, repo=repo)
    print(f"Connected repo: {response.name}")

# Example usage
connect_repo("your-gcp-project-id", "https://github.com/your-org/your-repo.git")
