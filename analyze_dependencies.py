#!/usr/bin/env python3
import json
import os
from pathlib import Path
from collections import defaultdict

def find_package_json_files():
    """找到所有package.json文件（排除node_modules）"""
    package_files = []
    for root, dirs, files in os.walk('.'):
        # 跳过node_modules目录
        dirs[:] = [d for d in dirs if d != 'node_modules']
        
        if 'package.json' in files:
            package_files.append(os.path.join(root, 'package.json'))
    
    return sorted(package_files)

def analyze_dependencies():
    """分析所有依赖版本"""
    package_files = find_package_json_files()
    
    # 依赖名称 -> {文件路径: 版本} 的映射
    all_deps = defaultdict(dict)
    
    for pkg_file in package_files:
        try:
            with open(pkg_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # 收集所有类型的依赖
            dep_types = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
            
            for dep_type in dep_types:
                if dep_type in data:
                    for dep_name, version in data[dep_type].items():
                        all_deps[dep_name][pkg_file] = {
                            'version': version,
                            'type': dep_type
                        }
        
        except Exception as e:
            print(f"Error reading {pkg_file}: {e}")
    
    return all_deps, package_files

def find_version_conflicts(all_deps):
    """找到版本冲突的依赖"""
    conflicts = {}
    
    for dep_name, locations in all_deps.items():
        if len(locations) > 1:
            versions = set()
            for location_info in locations.values():
                versions.add(location_info['version'])
            
            # 如果有多个不同版本，记录为冲突
            if len(versions) > 1:
                conflicts[dep_name] = locations
    
    return conflicts

def main():
    print("Analyzing project dependencies...")
    
    all_deps, package_files = analyze_dependencies()
    conflicts = find_version_conflicts(all_deps)
    
    print(f"\nFound {len(package_files)} package.json files:")
    for pkg_file in package_files:
        print(f"  - {pkg_file}")
    
    print(f"\nTotal {len(all_deps)} different dependencies")
    
    if conflicts:
        print(f"\nWARNING: Found {len(conflicts)} dependencies with version conflicts:")
        print("=" * 60)
        
        for dep_name, locations in sorted(conflicts.items()):
            print(f"\n{dep_name}:")
            for pkg_file, info in locations.items():
                print(f"  {pkg_file}: {info['version']} ({info['type']})")
    
    else:
        print("\nOK: No version conflicts found")
    
    # 特别检查常见的问题依赖
    problem_deps = ['glob', 'rimraf', 'minimatch', 'typescript', 'eslint']
    print(f"\nChecking common problem dependencies ({', '.join(problem_deps)}):")
    print("=" * 60)
    
    for dep_name in problem_deps:
        if dep_name in all_deps:
            locations = all_deps[dep_name]
            print(f"\n{dep_name}:")
            for pkg_file, info in locations.items():
                print(f"  {pkg_file}: {info['version']} ({info['type']})")
        else:
            print(f"\n{dep_name}: Not found")

if __name__ == "__main__":
    main()