# Pyrmethus, the Termux Coding Wizard, summons the power of Zsh in Termux
# Crafting an enchanted .zshrc for harmony and efficiency

# Source Termux environment setup
[ -f /data/data/com.termux/files/usr/etc/profile ] && source /data/data/com.termux/files/usr/etc/profile

# Initialize Zsh plugins (ensure installed via pkg)
# Command: pkg install zsh zsh-completions git
ZSH_PLUGINS_DIR="$HOME/.zsh"
[ ! -d "$ZSH_PLUGINS_DIR" ] && mkdir -p "$ZSH_PLUGINS_DIR"

# Load zsh-completions
fpath=($ZSH_PLUGINS_DIR/zsh-completions/src $fpath)

# Clone and load zsh-autosuggestions if not present
if [ ! -d "$ZSH_PLUGINS_DIR/zsh-autosuggestions" ]; then
  git clone https://github.com/zsh-users/zsh-autosuggestions "$ZSH_PLUGINS_DIR/zsh-autosuggestions"
fi
source "$ZSH_PLUGINS_DIR/zsh-autosuggestions/zsh-autosuggestions.zsh"

# Clone and load zsh-syntax-highlighting if not present
if [ ! -d "$ZSH_PLUGINS_DIR/zsh-syntax-highlighting" ]; then
  git clone https://github.com/zsh-users/zsh-syntax-highlighting "$ZSH_PLUGINS_DIR/zsh-syntax-highlighting"
fi
source "$ZSH_PLUGINS_DIR/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"

# Enable completion system
autoload -Uz compinit
compinit

# History settings for eternal memory
setopt APPEND_HISTORY
setopt SHARE_HISTORY
HISTFILE=$HOME/.zsh_history
HISTSIZE=10000
SAVEHIST=10000

# Prompt enchantment: Display user, host, and directory in vibrant colors
autoload -U colors && colors
PROMPT="%{$fg_bold[blue]%}%n@%m%{$reset_color%} %{$fg[green]%}%~%{$reset_color%} $ "

# Aliases: Summon shortcuts to wield terminal powers
alias ls='ls --color=auto'          # Colorized ls output
alias ll='ls -lah'                  # Detailed listing with human-readable sizes
alias cls='clear; termux-toast "Screen cleared!"' # Clear with a mystical toast
alias py='python'                   # Quick Python invocation
alias gs='git status'               # Swift Git status check
alias gp='git pull'                 # Pull from the ether
alias gc='git commit -m'            # Commit with a message
alias termux-reload='termux-reload-settings' # Reload Termux settings
alias pkgup='pkg update && pkg upgrade' # Update and upgrade packages

# Functions: Arcane spells for common tasks

# Function to create and enter a directory
mkcd() {
  mkdir -p "$1" && cd "$1"
  echo -e "\033[1;32mEntered the newly forged path: $1\033[0m"
}

# Function to backup a file with timestamp
backup() {
  if [ -f "$1" ]; then
    cp "$1" "${1}.bak-$(date +%Y%m%d_%H%M%S)"
    echo -e "\033[1;34mBackup created: ${1}.bak-$(date +%Y%m%d_%H%M%S)\033[0m"
    termux-toast "Backup complete!"
  else
    echo -e "\033[1;31mError: File $1 not found!\033[0m"
    termux-toast -g error "File not found!"
  fi
}

# Function to search for a string in files recursively
search() {
  grep -rni "$1" . | while read -r line; do
    echo -e "\033[1;33m$line\033[0m"
  done
}

# Function to summon a Python virtual environment
venv() {
  python -m venv "$1" && source "$1/bin/activate"
  echo -e "\033[1;36mVirtual environment $1 activated!\033[0m"
  termux-toast "Virtual environment ready!"
}

# Key bindings for swift navigation
bindkey '^[[A' history-substring-search-up
bindkey '^[[B' history-substring-search-down

# Load zsh-history-substring-search for enchanted history search
if [ ! -d "$ZSH_PLUGINS_DIR/zsh-history-substring-search" ]; then
  git clone https://github.com/zsh-users/zsh-history-substring-search "$ZSH_PLUGINS_DIR/zsh-history-substring-search"
fi
source "$ZSH_PLUGINS_DIR/zsh-history-substring-search/zsh-history-substring-search.zsh"

# Final incantation to ensure Termux-specific settings
export TERM=xterm-256color
export PATH=$PATH:$HOME/.local/bin

# Display a mystical welcome
echo -e "\033[1;35mPyrmethus welcomes you to the Termux realm!\033[0m"