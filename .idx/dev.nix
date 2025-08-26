{ pkgs, ... }: {
  channel = "stable-24.05";
  packages = [
    pkgs.nodejs_22
  ];
  services = {
    docker.enable = true;
  };
  env = {};
  idx = {
    extensions = [ ];
    workspace = {
      onCreate = { 
        npm-scripts = "npm i && npm run preflight";
      };
      onStart = { };
    };
  };
}
