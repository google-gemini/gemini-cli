package WindowsJava;

import java.io.IOException;
import java.io.PrintStream;
import java.nio.file.*;
import java.nio.file.attribute.*;
import java.util.*;

/**
 * WindowsAclChecker v1.0
 * Verifica ACLs do Windows. Corrige falso-positivo do Gemini CLI em C:\ProgramData:
 * BUILTIN\Users tem ADD_FILE/ADD_SUBDIRECTORY nesse path por design do SO.
 *
 * Protocolo de saida (compativel com parseWindowsBatchSecurityOutput no TS):
 *   PATH:<caminho>
 *   OWNER:<nome>  (apenas se owner nao for admin/SYSTEM)
 *   PERMS:<nomes> (apenas se houver permissao perigosa de nao-admin)
 *   ERROR:<msg>   (apenas se a leitura de ACL falhar)
 */
public class WindowsAclChecker {

    private static final Set<String> TRUSTED_SIDS = Set.of(
        "S-1-5-32-544", "S-1-5-18", "S-1-3-0", "S-1-3-1"
    );

    private static final Set<String> KNOWN_SYSTEM_PATHS = Set.of(
        "c:\\programdata", "c:\\windows",
        "c:\\program files", "c:\\program files (x86)"
    );

    private static final Set<AclEntryPermission> WRITE_FILE_PERMS = EnumSet.of(
        AclEntryPermission.WRITE_DATA, AclEntryPermission.APPEND_DATA,
        AclEntryPermission.WRITE_ATTRIBUTES, AclEntryPermission.WRITE_NAMED_ATTRS,
        AclEntryPermission.DELETE, AclEntryPermission.WRITE_ACL, AclEntryPermission.WRITE_OWNER
    );

    private static final Set<AclEntryPermission> WRITE_DIR_PERMS = EnumSet.of(
        AclEntryPermission.ADD_FILE, AclEntryPermission.ADD_SUBDIRECTORY,
        AclEntryPermission.DELETE, AclEntryPermission.WRITE_ACL, AclEntryPermission.WRITE_OWNER
    );

    // Para system paths: ADD_FILE/ADD_SUBDIRECTORY sao isentos (design do SO)
    private static final Set<AclEntryPermission> WRITE_SYSTEM_DIR_PERMS = EnumSet.of(
        AclEntryPermission.DELETE, AclEntryPermission.WRITE_ACL, AclEntryPermission.WRITE_OWNER
    );

    // Nome localizado de BUILTIN\Users resolvido via PowerShell na inicializacao
    private static final String USERS_GROUP_NAME = resolveUsersGroupName();

    private static String resolveUsersGroupName() {
        try {
            String ps = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
            ProcessBuilder pb = new ProcessBuilder(ps,
                "-NoProfile", "-NonInteractive", "-Command",
                "(New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-545'))" +
                ".Translate([System.Security.Principal.NTAccount]).Value");
            pb.redirectErrorStream(true);
            Process proc = pb.start();
            String out = new String(proc.getInputStream().readAllBytes(), "UTF-8").trim();
            proc.waitFor();
            return out.isEmpty() ? null : out;
        } catch (Exception e) {
            return null;
        }
    }

    public static void main(String[] args) throws Exception {
        PrintStream out = new PrintStream(System.out, true, "UTF-8");

        for (String rawPath : args) {
            String norm = rawPath.toLowerCase(Locale.ROOT).replace("/", "\\");
            out.println("PATH:" + rawPath);

            Path p = Paths.get(rawPath);
            if (!Files.exists(p)) continue;

            boolean isDir = Files.isDirectory(p);
            boolean isSysPath = KNOWN_SYSTEM_PATHS.contains(norm);

            // 1. Owner
            try {
                String owner = Files.getFileAttributeView(p, FileOwnerAttributeView.class)
                                    .getOwner().getName();
                if (!isTrustedOwner(owner)) out.println("OWNER:" + owner);
            } catch (IOException e) {
                out.println("ERROR:" + e.getMessage());
                continue;
            }

            // 2. ACEs
            try {
                List<String> bad = new ArrayList<>();
                Set<AclEntryPermission> dangerous =
                    isDir && isSysPath ? WRITE_SYSTEM_DIR_PERMS
                    : isDir           ? WRITE_DIR_PERMS
                                      : WRITE_FILE_PERMS;

                for (AclEntry entry : Files.getFileAttributeView(
                        p, AclFileAttributeView.class).getAcl()) {
                    if (entry.type() != AclEntryType.ALLOW) continue;
                    String principal = entry.principal().getName();
                    if (isTrustedSid(principal)) continue;
                    // Em system paths, BUILTIN\Users (qualquer locale) e isento
                    if (isSysPath && isDir && isUsersGroup(principal)) continue;

                    Set<AclEntryPermission> perms = entry.permissions();
                    if (perms.isEmpty()) continue;
                    Set<AclEntryPermission> x = EnumSet.copyOf(perms);
                    x.retainAll(dangerous);
                    if (!x.isEmpty()) bad.add(principal);
                }
                if (!bad.isEmpty()) out.println("PERMS:" + String.join(", ", bad));
            } catch (IOException e) {
                out.println("ERROR:" + e.getMessage());
            }
        }
    }

    private static boolean isUsersGroup(String name) {
        if (name == null) return false;
        // Compara com o nome localizado resolvido (BUILTIN\Usuários, BUILTIN\Users, etc.)
        if (USERS_GROUP_NAME != null && name.equalsIgnoreCase(USERS_GROUP_NAME)) return true;
        // Fallback: padroes de nomes internacionais do grupo Users
        String lower = name.toLowerCase(Locale.ROOT);
        String[] patterns = {"\\users", "\\usuários", "\\utilisateurs",
                             "\\benutzer", "\\utenti", "\\usuarios", "\\gebruikers"};
        for (String pat : patterns) {
            if (lower.endsWith(pat)) return true;
        }
        return lower.equals("users") || lower.equals("usuários");
    }

    private static boolean isTrustedOwner(String n) {
        if (n == null) return false;
        String l = n.toLowerCase(Locale.ROOT);
        return l.contains("administrators") || l.contains("administradores")
            || l.contains("system") || l.contains("sistema")
            || l.contains("trustedinstaller") || l.contains("creator owner")
            || l.contains("proprietário criador") || l.contains("creator group")
            || TRUSTED_SIDS.stream().anyMatch(s -> l.contains(s.toLowerCase(Locale.ROOT)));
    }

    private static boolean isTrustedSid(String s) {
        if (s == null) return false;
        String l = s.toLowerCase(Locale.ROOT);
        for (String t : TRUSTED_SIDS) if (l.contains(t.toLowerCase(Locale.ROOT))) return true;
        if (s.startsWith("S-1-5-80-")) return true;
        return l.contains("administrators") || l.contains("administradores")
            || l.contains("system") || l.contains("sistema")
            || l.contains("trustedinstaller") || l.contains("creator owner")
            || l.contains("creator group");
    }
}