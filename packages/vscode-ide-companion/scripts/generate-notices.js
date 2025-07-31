import fs from 'fs/promises';
import path from 'path';

const projectRoot = path.resolve(
  path.join(import.meta.dirname, '..', '..', '..'),
);

async function main() {
  const packagePath = path.join(
    projectRoot,
    'packages',
    'vscode-ide-companion',
  );

  const packageJsonPath = path.join(packagePath, 'package.json');
  const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageJsonContent);

  const dependencies = packageJson.dependencies || {};
  const dependencyNames = Object.keys(dependencies);

  let noticeText =
    'This file contains third-party software notices and license terms.\n\n';

  for (const depName of dependencyNames) {
    const depPackageJsonPath = path.join(
      projectRoot,
      'node_modules',
      depName,
      'package.json',
    );
    const depPackageJsonContent = await fs.readFile(
      depPackageJsonPath,
      'utf-8',
    );
    const depPackageJson = JSON.parse(depPackageJsonContent);

    const licenseFile = depPackageJson.licenseFile
      ? path.join(path.dirname(depPackageJsonPath), depPackageJson.licenseFile)
      : path.join(path.dirname(depPackageJsonPath), 'LICENSE');

    let licenseContent = 'License text not found.';
    try {
      licenseContent = await fs.readFile(licenseFile, 'utf-8');
    } catch (e) {
      // ignore
    }

    noticeText +=
      '============================================================\n';
    noticeText += `${depPackageJson.name}@${depPackageJson.version}\n`;
    noticeText += `(${depPackageJson.repository?.url || 'No repository found'})\n\n`;
    noticeText += `${licenseContent}\n\n`;
  }

  const noticeFilePath = path.join(packagePath, 'NOTICES.txt');
  await fs.writeFile(noticeFilePath, noticeText);

  console.log(`NOTICES.txt generated at ${noticeFilePath}`);
}

main().catch(console.error);
