package com.momuying.studentstudy.learning.dto;

import java.util.List;

public record DeleteItemsRequest(List<Long> itemIds) {
}
