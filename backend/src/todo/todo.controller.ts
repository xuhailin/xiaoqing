import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TodoService } from './todo.service';
import type { CreateTodoInput, CreateTodoTaskInput, UpdateTodoInput } from './todo.types';

@Controller('todos')
export class TodoController {
  constructor(private readonly todoService: TodoService) {}

  @Post()
  create(@Body() body: CreateTodoInput) {
    return this.todoService.createTodo(body);
  }

  @Get()
  list(@Query('status') status?: string) {
    return this.todoService.listTodos(status as any);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.todoService.getTodo(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateTodoInput) {
    return this.todoService.updateTodo(id, body);
  }

  @Post(':id/create-task')
  createTask(@Param('id') id: string, @Body() body: CreateTodoTaskInput) {
    return this.todoService.createTaskFromTodo(id, body);
  }
}
