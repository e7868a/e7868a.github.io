---
title: Kubernetes 进阶使用之 Helm，Kustomize
category: 系统运维
---

### 声明式 vs 命令式
Kubernetes 一个非常重要的特点是，它围绕“期望状态”工作。我们告诉 Kubernetes 需要运行哪些资源（Pod、Service 等），以及这些资源应该处于什么状态（镜像、参数、副本数等），Kubernetes 会持续尝试让实际状态向期望状态收敛。也就是说，如果我们声明使用 `nginx:latest` 镜像，运行 1 个名为 `nginx-pod` 的 Pod，Kubernetes 就会尽力确保集群中有且仅有 1 个符合要求的 Pod 在运行，直到我们修改这个 Pod 的期望状态。

Kubernetes 提供了两种方式来维护一个资源的状态，命令方式（Imperative）和声明方式（Declarative）。

命令方式是指我们直接通过指令一步一步地告诉 Kubernetes 要执行什么操作。以下命令会创建一个使用 `nginx` 镜像、名为 `nginx-pod` 的 Pod。

```bash
kubectl run nginx-pod --image=nginx
```

声明方式则要求我们先创建一个 YAML 文件，文件中包含资源的定义。例如，将下面的 YAML 文件保存为 `nginx-pod.yaml`。

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx-pod
spec:
  containers:
    - image: nginx
      name: nginx-pod
```

然后，使用 `kubectl apply` 创建资源。如果需要修改 Pod，更新 `nginx-pod.yaml` 后再次执行 `kubectl apply` 即可。

```
kubectl apply -f nginx-pod.yaml
```

乍一看，声明方式麻烦了很多。但是仔细想一下，Kubernetes 中的 Pod 配置并不只是一个 image 参数这么简单。实际使用中，把参数都写在命令行里，显然不如写在 YAML 文件里清晰。

除此之外，绝大多数 Kubernetes 资源都需要重复使用。例如，开发环境、测试环境和生产环境往往要部署同一套应用，只是参数不同。为了实现 CI/CD，我们还需要自动化更新这些资源，并保留不同环境之间的参数差异。把资源定义保存为 YAML 文件，再通过自动化 Pipeline 将不同参数发布到不同环境，是更适合工程化的做法。

更进一步，我们还可以把 YAML 文件和 Pipeline 都提交到 Git 代码库中，通过 Git 管理不同环境之间的配置差异和版本历史，再自动或手动触发 Pipeline，实现不同环境下的 CI/CD。这也就是所谓的 GitOps。

### Helm

既然使用声明式方式，也就是用 YAML 文件管理 Kubernetes 资源配置，是更适合工程化的实践，那么如何有效管理这些 YAML 文件，并让它们可以重复使用，就成了一个现实需求。Helm 正是为此而来。

Helm 被称为 “the package manager for Kubernetes”。类似于我们使用 yum 管理软件包，`yum install` 可以安装软件包，`yum remove` 可以删除软件包。在 Helm 中，`helm install` 用来安装一个软件包，`helm uninstall` 用来删除这个软件包。

部署在 Kubernetes 中的应用通常会包含多个服务，比如前端服务和后端服务；每个服务又会包含不同的资源定义，比如 Deployment、ConfigMap、Service 等。因此，一个应用往往会包含很多 YAML 文件。Helm 以 Chart 的形式管理这些 YAML 文件，每个软件包对应一个 Chart。当然，Chart 中不限于只包含 YAML 文件。例如，Chart 中可以包含 PEM 文件，并由 PEM 文件生成 TLS Secret。

使用 `helm create someapp` 可以创建一个名为 someapp 的 Chart，其目录结构如下。

```
someapp/
  Chart.yaml          # A YAML file containing information about the chart
  charts              # A directory containing any charts upon which this chart depends.
  values.yaml         # The default configuration values for this chart
  templates/          # A directory of templates that, when combined with values,
                      # will generate valid Kubernetes manifest files.
```

Helm 是基于**模板技术**的，`templates` 目录中定义 YAML 文件模板，`values.yaml` 中定义模板变量的默认值。

例如，`templates/deployment.yaml` 中定义了一个 Deployment 资源：

```yaml
{% raw %}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "someapp.fullname" . }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "someapp.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "someapp.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: main-container
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
{% endraw %}
```

`values.yaml` 中定义对应的默认值：

```yaml
replicaCount: 1

image:
  repository: nginx
  tag: "latest"
```

Helm 在部署时会渲染出对应的 YAML 文件：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: someapp-test-someapp
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: someapp
      app.kubernetes.io/instance: someapp-test
  template:
    metadata:
      labels:
        app.kubernetes.io/name: someapp
        app.kubernetes.io/instance: someapp-test
    spec:
      containers:
        - name: main-container
          image: "nginx:latest"
```

在 `helm install` 或者 `helm upgrade` 时，我们可以通过 `--set replicaCount=3` 覆盖 `values.yaml` 中定义的默认值。也可以新建一个 YAML 文件，例如 `values-prod.yaml`，然后使用 `-f values-prod.yaml` 覆盖 `values.yaml` 中的默认值。Helm 会将 `values-prod.yaml` 中的变量值合并到原始的 `values.yaml` 中。以上只是一个简单示例，实际使用中，通过模板技术可以实现非常复杂的应用部署。

Helm 的另一个优势是支持 Repository。我们既可以使用别人提供的 Repository，也可以搭建自己的 Repository，从而像使用软件包一样方便地引用别人开发的 Chart。例如，如果要安装 MySQL 数据库，我们不需要自己编写 Chart，从公开的 Repository 下载一个即可。

首先，添加 Bitnami 源：

```bash
# 添加 bitnami 源
> helm repo add bitnami https://charts.bitnami.com/bitnami

# 查看 bitnami 源中的 Charts
> helm search repo bitnami
```

如果我们要安装 MySQL，可以直接搜索 `mysql`：

```bash
# 以下命令，可以获取 repository 中的最新 Chart
> helm repo update

# 查找 mysql Chart
> helm search repo mysql

# 安装 mysql，其中 first-mysql 是 release 名称，用于区分不同的 MySQL 实例
> helm install first-mysql bitnami/mysql

# 删除安装的 mysql
> helm uninstall first-mysql
```

可以看到，Helm Chart 使用起来非常方便。`template` 和 `values` 的分离，让我们在使用时可以不关注具体的资源定义，只要给出需要的 `values.yaml` 就可以部署一个应用。这对第三方应用的部署尤其方便。但是，如果我们自己的应用变动比较大，经常需要调整文件结构，还要兼容新旧版本，维护 Chart 就会变得麻烦。而且 Helm 使用的是 Go template 技术，复杂模板需要不断调试，不仅有学习成本，编写和维护模板本身也需要额外成本。

### Kustomize

**Kustomize** 被称为 Kubernetes native configuration management。从 Kubernetes 1.14 开始，Kustomize 已经集成到 `kubectl` 中，可以通过 `-k` 参数直接使用。与 Helm 不同，Kustomize 不使用模板技术。Kubernetes 的设计提案 [Declarative application management in Kubernetes](https://github.com/kubernetes/design-proposals-archive/blob/main/architecture/declarative-application-management.md) 介绍了它背后的思路：配置管理应该直接管理配置内容，而不是把配置转换成另一套需要额外学习的模板语言。

Kustomize 通过 Base 和 Overlay 来管理不同环境之间的差异。

1. Base：先维护一套基础资源定义，作为所有环境的公共部分。
2. Overlay：为某个特定环境创建覆盖层，覆盖 Base 中的部分内容，也可以新增资源。
3. Generator：Kustomize 提供了一些内置生成器，例如 `configMapGenerator` 可以根据文件或字面量生成 ConfigMap。

无论 Base 还是 Overlay，使用的都是原生 Kubernetes 资源定义，不需要模板。Overlay 可以理解为一种 Patch 机制：我们不直接修改下层资源定义，而是通过 Patch 覆盖它。这和 Kubernetes 声明式管理的思想是一致的：用户提交期望状态，系统负责把当前状态调整到期望状态。

Base 包含一个 `kustomization.yaml` 文件和其他 Kubernetes 资源定义，例如：

```
~/someApp
├── deployment.yaml
├── kustomization.yaml
└── service.yaml
```

`kustomization.yaml` 表示这是一个 Kustomize 能够识别的目录，它定义了通用 metadata，以及应用所包含的资源文件。

![base](/img/posts/base.jpg)

使用 `kubectl kustomize someApp` 可以输出应用所有的 YAML 资源文件。

Overlay 同样需要包含 `kustomization.yaml`。这个文件会引用 base 目录，并指定 patches 和其他新增资源文件，例如：

```
~/someApp
├── base
│   ├── deployment.yaml
│   ├── kustomization.yaml
│   └── service.yaml
└── overlays
    ├── development
    │   ├── cpu_count.yaml
    │   ├── kustomization.yaml
    │   └── replica_count.yaml
    └── production
        ├── cpu_count.yaml
        ├── kustomization.yaml
        └── replica_count.yaml
```

这里定义了 development 和 production 两个 overlay，overlay 的内容如下图所示。

![overlay](/img/posts/overlay.jpg)

Kustomize 更贴近 Kubernetes 原生风格。它基本沿用 Kubernetes 本身的资源定义和 Patch 思路，只要熟悉 Kubernetes，就比较容易理解 Kustomize，不需要额外维护一套模板语言。

### Helm vs Kustomize

看上去 Kustomize 在理念上更贴近 Kubernetes 原生声明式配置，但实际选择时仍然要看场景。

- Kustomize 没有包的概念，对配置文件和其他二进制资源更友好，也更适合放在 Git 代码库里管理。不过 Helm 也支持直接以目录形式使用，不一定要先打包；打包后的 Helm Chart 在共享和分发上更方便，尤其适合交付到客户环境的场景。
- Helm 需要掌握 Go template 写法，有一定学习成本。但发展到今天，Helm 已经积累了很多固定范式，Kubernetes 资源种类也相对有限，参考成熟 Chart 写出可维护的模板并不难。Kustomize 通过 patch 文件自定义配置，更直观，但在复杂场景下也可能有局限。
- Helm 将 `template` 和 `values` 分离，这一点很有价值。从实际经验看，要求每个运维或开发人员都理解 Kubernetes 资源定义的全部细节并不现实；只关注 `values` 往往更容易上手。
- 对简单环境差异来说，Kustomize 的维护效率通常更高，这一点不应该忽视。
- 我们同时使用 Helm 和 Kustomize，但 Helm 更多一些。我们有大量结构相似的 Tomcat 应用和 Spring Boot 应用，基于包的引用和复用确实更方便。
- Helm 模板不能直接读取 Chart 目录之外的文件内容。如果要直接使用配置文件，需要把文件放进 Chart 里，这并不十分方便；同时 Chart 本身也有大小限制。

