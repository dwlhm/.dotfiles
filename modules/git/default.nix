{ config, pkgs, lib, ... }:

let
  accounts = builtins.fromJSON (builtins.readFile ../../secrets/accounts.json);
  homeDir = config.home.homeDirectory;

  mkAccountSecrets = id: {
    "ssh_keys/${id}" = {
      path = "${homeDir}/.ssh/keys/${id}";
      mode = "0600";
    };
    "git/${id}/name" = { };
    "git/${id}/email" = { };
    "git/${id}/host" = { };
    "git/${id}/org" = { };
    "git/${id}/dir" = { };
    "git/${id}/token" = { };
  };

  allSecrets = lib.foldl' (acc: id: acc // (mkAccountSecrets id)) { } accounts;

  mkIdTemplate = id: {
    name = "git-id-${id}.inc";
    value = {
      path = "${homeDir}/.config/git/identities/id-${id}.inc";
      mode = "0600";
      content = ''
        [user]
          name = ${config.sops.placeholder."git/${id}/name"}
          email = ${config.sops.placeholder."git/${id}/email"}
        [core]
          sshCommand = ssh -i ~/.ssh/keys/${id} -o IdentitiesOnly=yes
      '';
    };
  };

  idTemplates = builtins.listToAttrs (map mkIdTemplate accounts);

  rulesContent = lib.concatMapStringsSep "\n" (id: ''
    [includeIf "gitdir:${config.sops.placeholder."git/${id}/dir"}/"]
      path = ~/.config/git/identities/id-${id}.inc
    [includeIf "hasconfig:remote.*.url:https://${config.sops.placeholder."git/${id}/host"}/${config.sops.placeholder."git/${id}/org"}/**"]
      path = ~/.config/git/identities/id-${id}.inc
    [includeIf "hasconfig:remote.*.url:git@${config.sops.placeholder."git/${id}/host"}:${config.sops.placeholder."git/${id}/org"}/**"]
      path = ~/.config/git/identities/id-${id}.inc
    [includeIf "hasconfig:remote.*.url:git@${config.sops.placeholder."git/${id}/host"}-${id}:*/**"]
      path = ~/.config/git/identities/id-${id}.inc
    [includeIf "hasconfig:remote.*.url:git@${config.sops.placeholder."git/${id}/host"}-${id}:${config.sops.placeholder."git/${id}/org"}/**"]
      path = ~/.config/git/identities/id-${id}.inc
  '') accounts;

  sshHostsContent = lib.concatMapStringsSep "\n" (id: ''
    Host ${config.sops.placeholder."git/${id}/host"}-${id}
      HostName ${config.sops.placeholder."git/${id}/host"}
      User git
      IdentityFile ~/.ssh/keys/${id}
      IdentitiesOnly yes

    Host ${config.sops.placeholder."git/${id}/host"}
      HostName ${config.sops.placeholder."git/${id}/host"}
      User git
      IdentityFile ~/.ssh/keys/${id}
      IdentitiesOnly yes
  '') accounts;
in {
  sops = {
    age.keyFile = "${homeDir}/.config/sops/age/keys.txt";
    defaultSopsFile = ../../secrets/secrets.yaml;
    secrets = allSecrets;
    templates = idTemplates // {
      "git-identities-rules.inc" = {
        path = "${homeDir}/.config/git/identities/rules.inc";
        mode = "0600";
        content = ''
          [includeIf "gitdir:~/.dotfiles/"]
            path = ~/.config/git/identities/id-personal.inc
          [includeIf "gitdir:~/brain/"]
            path = ~/.config/git/identities/id-personal.inc
          ${rulesContent}
        '';
      };
      "ssh-sops-hosts.conf" = {
        path = "${homeDir}/.ssh/config.d/sops-hosts.conf";
        mode = "0600";
        content = ''
          ${sshHostsContent}

          Host *
            AddKeysToAgent yes
            UseKeychain yes
        '';
      };
      "gh-hosts.yml" = {
        path = "${homeDir}/.config/gh/hosts.yml";
        mode = "0600";
        content = ''
          github.com:
              user: ${config.sops.placeholder."git/personal/org"}
              oauth_token: ${config.sops.placeholder."git/personal/token"}
              git_protocol: ssh
              users:
                  ${config.sops.placeholder."git/personal/org"}:
                      oauth_token: ${config.sops.placeholder."git/personal/token"}
                      git_protocol: ssh
        '';
      };
    };
  };

  programs.git = {
    enable = true;
    package = pkgs.emptyDirectory;
    ignores = [
      ".DS_Store"
      ".envrc"
      ".direnv/"
    ];
    includes = [
      { path = "~/.config/git/identities/rules.inc"; }
    ];
    settings = {
      user.useConfigOnly = true;
      core.autocrlf = "input";
      credential = {
        helper = "osxkeychain";
        useHttpPath = true;
      };
    };
  };

  programs.gh = {
    enable = true;
    gitCredentialHelper.enable = true;
    settings = {
      git_protocol = "ssh";
      prompt = "enabled";
    };
  };

  programs.ssh = {
    enable = true;
    enableDefaultConfig = false;
    includes = [
      "~/.orbstack/ssh/config"
      "~/.ssh/config.d/sops-hosts.conf"
    ];
  };
}
