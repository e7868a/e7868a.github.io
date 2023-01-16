---
title: Kubernetes 进阶使用之 Helm，Kustomize
category: 系统运维
---

### Declarative vs imperative
Kubernetes 一个非常优秀的特点是，它是基于状态的。我们告诉 Kubernetes 我们需要运行什么样的资源（ Pod, Service 等），以及这个资源对应的状态（参数，状态等），Kubernetes 帮助我们确保这些资源按我们要求的状态运行。也就是说，如果我们告诉 Kubernetes 使用 `nginx:latest` 镜像，运行 1 个名为 nginx-pod 的 Pod，Kubernetes 就会努力确保有且仅有 1 个 image 为 nginx:latest，名称为 nginx-pod 的 Pod 在运行，直到我们更改这个 Pod 的状态。

Kubernetes 提供了两种方式来维护一个资源的状态，命令方式（Imperative）和声明方式（Declarative）。

命令方式是指我们直接通过指令一步一步地告诉 Kubernetes 我们希望的操作。以下命令告诉 Kubernetes 运行一个 nginx 镜像的 pod, 名称为 nginx-pod。

```bash
kubectl run nginx-pod --image=nginx
```

声明方式则要求我们先创建一个 yaml 文件，yaml 文件中需要包含我们要求的资源的定义。例如，将下面的 yaml 文件保存为 nginx-pod.yaml。

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

然后，使用 kubectl apply 创建资源。如果需要修改 Pod，则更新 nginx-pod.yaml 后，再次执行 kubectl apply 即可。

```
kubectl apply -f nginx-pod.yaml
```

乍一看，声明方式麻烦了很多，但是仔细思考一下，Kubernetes 中 Pod 配置可不仅仅是一个 image 参数这么简单，实际使用中，把参数都写在命令行里，显然没有写到 Yaml 文件里清晰明了。

除此之外，绝大多数情况下，我们的 Kubernetes 资源是需要重复使用的，例如，开发环境、测试环境和生产环境之间往往要重复部署。为了能够实现 CI/CD，我们还需要能够自动化地去更新这些资源，并保持不同环境之间的参数差异。把资源部署以 Yaml 文件的形式保存下来，经过适当的变更参数后，通过自动化的 Pipeline 就可以发布到不同的环境，这无疑是最佳实践。

更进一步地，我们还可以把 Yaml 文件和 Pipeline 都提交到 Git 代码库中，通过 Git 来管理不同环境之间的配置差异和版本历史，然后自动或者手动地触发 Pipeline 就可以实现不同环境下的 CI/CD。这也就是所谓的 GitOps。

### Helm

既然使用声明式的方式，也就是 Yaml 文件来管理 Kubernetes 的资源配置是最佳实践，那么如何有效地管理 Yaml 文件，并能够重复使用，便成为了一个需求。Helm 便是为此而来。

Helm 被称为 the package manager for Kubernetes。类似于我们使用 yum 来管理软件包，使用 `yum install` 可以安装一个软件包，`yum remove` 则删除这个软件包。在Helm中，`helm install` 可以安装一个软件包，`helm uninstall` 则删除这个软件包。

我们部署在 Kubenertes 中的应用，通常会包含多个服务，比如前端服务和后端服务，每个服务又包含不同的资源定义，比如 Deployment, ConfigMap, Service 等。一个应用会包含很多个 Yaml 文件。Helm 以 Chart 的形式来管理这些 Yaml 文件。每个软件包对应一个 Chart。当然，Chart 中不限于只包含 Yaml 文件，例如，Chart 中可以包含 pem 文件，由 pem 文件生成 TLS Secret。

使用 `helm create someapp` 可以创建一个名为 someapp 的 Chart，其目录结构如下。

```
someapp/
  Chart.yaml          # A YAML file containing information about the chart
  charts              # A directory containing any charts upon which this chart depends.
  values.yaml         # The default configuration values for this chart
  templates/          # A directory of templates that, when combined with values,
                      # will generate valid Kubernetes manifest files.
```

Helm 是基于**模板技术**的，`templates` 目录中定义了 Yaml 文件模板， values.yaml 中定义了模板变量的默认值。

例如 templates/deployment.yaml 中定义了一个 Deployment 资源

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

values.yaml 中定义对应的默认值 

```yaml
replicaCount: 1

image:
  repository: nginx
  tag: "latest"
```

Helm 在部署时会渲染出对应的 Yaml 文件

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: somapp-test-someapp
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: someapp
      app.kubernetes.io/instance: somapp-test
  template:
    metadata:
      labels:
        app.kubernetes.io/name: someapp
        app.kubernetes.io/instance: somapp-test
    spec:
      containers:
        - name: main-container
          image: "nginx:latest"
```

在 `helm install` 或者 `helm update` 时，我们可以通过参数 `--set replicaCount=3` 覆盖 values.yaml 中定义的默认值。也可以新建一个 yaml 文件，例如 values-prod.yaml，然后使用参数 `-f values-prod.yaml`覆盖 values.yaml 中定义的默认值，Helm 会将 values-prod.yaml 中的变量值合并到原始的 values.yaml中。以上仅是简单示例，实际使用中，通过模板技术可以实现非常复杂的应用部署。

Helm 的另外一个优势是，它支持 Repository，我们可以使用别人提供的Repository，也可以搭建自己的 Repository。可以像使用软件包一样方便地使用或者引用别人开发的 Charts。例如，如果要安装 Mysql 数据库，我们不需要自己编写 Chart，从公开的 Repoistory 下载一个即可。

首先，添加 bitnami 源

```bash
# 添加 bitnami 源
> helm repo add bitnami https://charts.bitnami.com/bitnami

# 查看 bitnami 源中的 Charts
> helm search repo bitnami
```

如果我们要安装 mysql，可以直接搜索 mysql

```bash
# 以下命令，可以获取 repository 中的最新 Chart
> helm repo update

# 查找 mysql chart
> helm search repo mysql

# 安装 mysql, 其中 first-mysql 是安装的名称，用于安装多个 mysql 时，区分不同的 mysql 实例
> helm install first-mysql bitnami/mysql

# 如果要删除安装的 mysql
> helm uninstall first-mysql
```

我们可以看到 Helm Chart 在使用上是非常方便的，template 和 values 的分离，让我们在使用时可以不关注具体的资源定义，只要给出需要的 values.yaml 就可以部署一个应用。这对于第3方应用的部署来说是非常方便的，但是，如果我们自己的应用变动比较大，需要经常变更文件结构，还要在新旧版本之间实现兼容，这就有些麻烦了。而且 Helm 使用的是 Go template 技术，复杂的模板还需要不断的调试，这不仅需要一点儿学习上的成本，编写模板本身也需要更多的成本。

### Kustomize

**Kustomize** 被称为 Kubernetes native configuration management，从 Kubernetes 1.14 开始，已经集成到 kubectl 中，可以通过添加 '-k' 参数直接使用。与 Helm 完全不同的是，Kustomize 不使用模板技术，在其官网有一篇文章 [Declarative application management in Kubernetes](https://github.com/kubernetes/design-proposals-archive/blob/main/architecture/declarative-application-management.md) 介绍了有关背景，作者认为配置管理应该管理的是配置的内容，而不应该把这些内容转换成模板，这种需要用户额外学习的东西。

Kustomize 通过以下步骤来实现不同环境的差异管理。

1. Fork，一般我们会先创建一个 Base 版本，所有环境都从这个 Base 版本 Fork 出新版本。
2. Overlay，为某个特定版本创建 Overlay，Overlay 会覆盖 Base 版本的某些内容，也会新增内容。
3. Kustomize 提供了一些内置的 generators ，例如 ConfigMapGenerator 可以将一个文件创建为 ConfigMap。

无论 Base 还是 Overlay 都是原生的Kubernetes 资源定义，不需要使用模板。Overlay 是一种 Patch 机制，我们不需要直接修改下层的资源定义，而是通过 Patch 来覆盖它。这个 Kubernetes 本身的思想是一致的，我们在使用 `kubectl apply` 时，实际上是在对象的原始状态，对象的当前状态，用户新指定的状态三者之间做了一次 merge 操作。

Base 包含一个 kustomization.yaml 文件和其它Kubernetes 资源定义，例如：

```
~/someApp
├── deployment.yaml
├── kustomization.yaml
└── service.yaml
```

kustomization.yaml 文件代表了这是一个 Kustomize 能够识别的目录，定义了通用的 meta data，和应用所包含的资源文件。

![base](/img/posts/base.jpg)

使用 `kubectl kustomize someApp` 可以输出应用所有的 Yaml 资源文件。

Overlay 同样需要包含 kustomization.yaml，kustomization.yaml 中会引用 base 目录，并指定 patches 和其它新增加的资源文件，例如：

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

我们定义了 development 和 production 两个 overlay，overlay 的内容如下图所示。

![overlay](/img/posts/overlay.jpg)

Kustomize 确实是更加 Kubernetes 的工具，完全按照 Kubernetes 本身的思想在工作，熟悉了 Kubernetes 基本也熟悉了 Kustomize，不太需要额外的学习成本和编写成本。

### Helm vs Kustomize

看上去 Kustomize 要比 Helm 在思想上更高级一些，但是实际使用中如何去选择，个人认为还是要考虑实际情况。

- Kustomize 没有包的概念，对配置文件，其它二进制文件等资源支持更友好，也更适合于 Git 代码库来管理。但是，Helm 也支持以目录的形式使用，不需要打包，同样适用于 Git 代码库管理。Helm 打包后共享会更方便，尤其适合于在客户环境部署的场景。
- Helm 虽然需要掌握 Go Template 写法，有学习成本，但是发展到今天，已经积累了很多固定范式的写法，Kubernetes 资源种类毕竟是有限的，参考他山之石，写出非常完善的 Tempalte 并不是难事。而 Kustomize 通过 patch 文件来自定义配置，有时是会有一些局限性的。
- Helm 将 template 和 values 分离的做法是有一定优势的，从个人实际经验来看，要求每个运维或者开发人员搞懂 Kubernetes 资源定义的写法还是有难度的，只关注 values 会更容易。
- 使用 Kustomize 的效率会更高，这是不应该忽视的。
- 我们同时使用了 Helm 和 Kustomize，但是 Helm 更多一些，我们有大量结构一样的 Tomcat 应用和 SpringBoot 应用，基于包的引用，确实感觉更方便一些。
- Helm 不能获取 Chart 目录之外文件的内容，所以要直接使用配置文件的话，需要把文件加到 Chart 里面，这并不十分方便，而且 Chart 有 1MB 的大小限制。

