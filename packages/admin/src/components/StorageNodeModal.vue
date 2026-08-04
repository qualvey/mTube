<template>
  <el-dialog
    :model-value="visible"
    title="注册新增存储节点"
    width="500px"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form :model="form" label-position="top">
      <el-form-item label="节点唯一标识符 (Node ID)" required>
        <el-input v-model="form.id" placeholder="例如：node-03" />
      </el-form-item>

      <el-form-item label="节点显示名称" required>
        <el-input v-model="form.name" placeholder="例如：东京存储节点 03" />
      </el-form-item>

      <el-form-item label="节点 HTTP Base URL" required>
        <el-input v-model="form.baseUrl" placeholder="例如：https://storage03.91cso.com" />
      </el-form-item>

      <el-form-item label="设为默认上传节点">
        <el-switch v-model="form.isDefault" active-text="默认节点" inactive-text="普通节点" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" class="font-bold" @click="handleSubmit">确认注册节点</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ElMessage } from 'element-plus'

const props = defineProps({
  visible: { type: Boolean, default: false },
  form: { type: Object, required: true }
})

const emit = defineEmits(['update:visible', 'submit'])

const handleSubmit = () => {
  if (!props.form.id || !props.form.name || !props.form.baseUrl) {
    ElMessage.warning('请填写完整的节点 ID、名称和 Base URL')
    return
  }
  emit('submit')
}
</script>
